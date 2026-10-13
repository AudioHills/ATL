// Global shader upgrades shared by every built-in material, plus the per-map
// atmosphere state the post stack reads each frame.
//
//  - Height fog with sun in-scattering (replaces FogExp2's flat look): denser in
//    the low streets, thinning with altitude, glowing toward the sun / moon.
//  - PCSS soft shadows with contact hardening for the sun (any light whose
//    shadow.radius >= 1000 opts in; radius - 1000 = penumbra texels per unit depth).
//  - Opaque PBR surfaces write a screen-space reflectivity mask into alpha
//    (1 - alpha = gloss² on near-horizontal surfaces), consumed by the SSR pass.
//
// Extra uniforms are injected into every ShaderLib entry that already has fog
// uniforms. Their values are plain {x,y,z(,w)} objects (not THREE.Vector*), so
// UniformsUtils.clone keeps them by reference and one write updates every material.
import * as THREE from 'three';

export const fogU = {
  sunDir: { x: 0, y: 1, z: 0 },
  sunCol: { x: 0, y: 0, z: 0 },
  // heightFalloff (1/m), baseHeight (m), sunPower, sunStrength
  params: { x: 0, y: 0, z: 8, w: 0 },
};

// Shared state for the post stack (set by World when a map is built).
export const atmo = {
  sunDir: new THREE.Vector3(0, 1, 0),
  sunColor: new THREE.Color(1, 1, 1),
  rays: 0,          // god-ray strength
  rayDecay: 0.95,
  ssr: 0,           // screen-space reflection strength
  ao: 1,            // ambient occlusion intensity
  aoRadius: 0.6,
  indoor: false,
  version: 0,
};

let patched = false;
export function patchShaders() {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk;

  // ---------- fog ----------
  C.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  C.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // view matrix rotation is orthonormal: world offset = R^T * viewPos
  vFogWorld = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif`;
  C.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  uniform vec3 fogSunDir;
  uniform vec3 fogSunCol;
  uniform vec4 fogParams;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `
#ifdef USE_FOG
  {
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogDist = length( fogRay );
    #ifdef FOG_EXP2
      // analytic integral of density * exp(-k * (y - h0)) along the view ray
      float fk = fogParams.x;
      float fdy = fogRay.y;
      float fogBase = fogDensity * exp( - fk * ( cameraPosition.y - fogParams.y ) );
      float fx = fk * fdy;
      float fogInteg = abs( fx ) > 0.001 ? ( 1.0 - exp( - fx ) ) / fx : 1.0 - 0.5 * fx;
      float fogOD = min( fogBase * fogDist * fogInteg, 30.0 );
      float fogFactor = 1.0 - exp( - fogOD );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    vec3 fogV = fogRay / max( fogDist, 1e-4 );
    float fmu = max( dot( fogV, fogSunDir ), 0.0 );
    vec3 fogTint = fogColor + fogSunCol * fogParams.w * ( pow( fmu, fogParams.z ) + 0.25 * pow( fmu, 2.0 ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );
  }
#endif`;

  // ---------- reflectivity mask for SSR ----------
  C.opaque_fragment = C.opaque_fragment + `
#if defined( STANDARD ) && defined( OPAQUE )
  {
    vec3 ssrUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    float ssrFlat = smoothstep( 0.8, 0.97, dot( normal, ssrUp ) );
    float ssrGloss = clamp( 1.0 - roughnessFactor, 0.0, 1.0 );
    gl_FragColor.a = 1.0 - ssrFlat * ssrGloss * ssrGloss;
  }
#endif`;

  // ---------- PCSS for the sun ----------
  C.shadowmap_pars_fragment = C.shadowmap_pars_fragment.replace(
    'float getShadow( sampler2D shadowMap,',
    `
  float pcssIGN( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
  vec2 pcssVogel( int i, int n, float phi ) {
    float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
    float th = float( i ) * 2.39996323 + phi;
    return r * vec2( cos( th ), sin( th ) );
  }
  float pcssShadow( sampler2D shadowMap, vec2 shadowMapSize, vec3 sc, float penumbraScale ) {
    vec2 texel = 1.0 / shadowMapSize;
    float phi = pcssIGN( gl_FragCoord.xy ) * 6.2831853;
    const float SEARCH = 14.0;
    float blk = 0.0, nb = 0.0;
    for ( int i = 0; i < 12; i ++ ) {
      vec2 o = pcssVogel( i, 12, phi ) * SEARCH * texel;
      float d = unpackRGBAToDepth( texture2D( shadowMap, sc.xy + o ) );
      if ( d < sc.z ) { blk += d; nb += 1.0; }
    }
    if ( nb < 0.5 ) return 1.0;
    blk /= nb;
    float rad = clamp( ( sc.z - blk ) * penumbraScale, 0.9, SEARCH );
    float s = 0.0;
    for ( int i = 0; i < 16; i ++ ) {
      vec2 o = pcssVogel( i, 16, phi ) * rad * texel;
      s += texture2DCompare( shadowMap, sc.xy + o, sc.z );
    }
    return s * ( 1.0 / 16.0 );
  }
  float getShadow( sampler2D shadowMap,`,
  ).replace(
    '#elif defined( SHADOWMAP_TYPE_PCF_SOFT )',
    `#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
      if ( shadowRadius >= 1000.0 ) {
        shadow = pcssShadow( shadowMap, shadowMapSize, shadowCoord.xyz, shadowRadius - 1000.0 );
      } else {`,
  ).replace(
    '#elif defined( SHADOWMAP_TYPE_VSM )\n\t\t\tshadow = VSMShadow',
    '}\n\t\t#elif defined( SHADOWMAP_TYPE_VSM )\n\t\t\tshadow = VSMShadow',
  );
  if (!C.shadowmap_pars_fragment.includes('pcssShadow( shadowMap, shadowMapSize, shadowCoord.xyz')) console.warn('PCSS patch failed');

  // ---------- inject the shared uniforms ----------
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[k].uniforms;
    if (!u || !u.fogColor) continue;
    u.fogSunDir = { value: fogU.sunDir };
    u.fogSunCol = { value: fogU.sunCol };
    u.fogParams = { value: fogU.params };
  }
  THREE.UniformsLib.fog.fogSunDir = { value: fogU.sunDir };
  THREE.UniformsLib.fog.fogSunCol = { value: fogU.sunCol };
  THREE.UniformsLib.fog.fogParams = { value: fogU.params };
}

// theme.haze = { falloff, base, sunPower, sun }  (sun = in-scatter strength)
export function setAtmosphere(th, sunDir, opts = {}) {
  const h = th.haze || {};
  const sd = sunDir.clone().normalize();
  fogU.sunDir.x = sd.x; fogU.sunDir.y = sd.y; fogU.sunDir.z = sd.z;
  const sc = new THREE.Color(h.color || th.sun);
  fogU.sunCol.x = sc.r; fogU.sunCol.y = sc.g; fogU.sunCol.z = sc.b;
  fogU.params.x = h.falloff ?? 0;
  fogU.params.y = h.base ?? 0;
  fogU.params.z = h.sunPower ?? 8;
  fogU.params.w = h.sun ?? 0;
  const L = th.look || {};
  atmo.sunDir.copy(sd);
  atmo.sunColor.set(L.rayColor || th.sun);
  atmo.rays = L.rays ?? 0;
  atmo.rayDecay = L.rayDecay ?? 0.95;
  atmo.ssr = L.ssr ?? 0;
  atmo.ao = L.ao ?? 1;
  atmo.aoRadius = L.aoRadius ?? 0.6;
  atmo.indoor = !!opts.indoor;
  atmo.version++;
}

patchShaders();
