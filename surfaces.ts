import * as THREE from 'three';

type Finish = 'plaster' | 'stone' | 'metal' | 'timber';

const noiseGLSL = `
varying vec3 vFinishPosition;
uniform float uFinishVariation;
float finishHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float finishNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(finishHash(i), finishHash(i + vec3(1,0,0)), f.x),
                 mix(finishHash(i + vec3(0,1,0)), finishHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(finishHash(i + vec3(0,0,1)), finishHash(i + vec3(1,0,1)), f.x),
                 mix(finishHash(i + vec3(0,1,1)), finishHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

// Continuous plot-space noise follows the group and never restarts at a module edge.
export function cleanSurface(color: string, finish: Finish, variation: number, roughness: number, metalness = 0) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  material.name = `Lokam / ${finish}`;
  material.userData.finish = { kind: finish, variation, coordinates: 'plot-space' };
  material.onBeforeCompile = shader => {
    shader.uniforms.uFinishVariation = { value: variation };
    shader.vertexShader = `varying vec3 vFinishPosition;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinishPosition = position;');
    shader.fragmentShader = noiseGLSL + shader.fragmentShader;
    const grain = finish === 'timber'
      ? `finishNoise(vFinishPosition * vec3(32.0, 0.42, 32.0)) - 0.5`
      : `finishNoise(vFinishPosition * 72.3) - 0.5`;
    const amplitude = finish === 'timber' ? '0.19' : finish === 'stone' ? '0.055' : '0.032';
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float finishMacro = finishNoise(vFinishPosition * 0.73 + vec3(6.1, 2.7, 4.3)) - 0.5;
      float finishGrain = ${grain};
      float finishFilter = 1.0 - smoothstep(0.005, 0.035, length(fwidth(vFinishPosition)));
      diffuseColor.rgb *= 1.0 + uFinishVariation * (finishMacro * 0.026 + finishGrain * ${amplitude} * finishFilter);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + finishGrain * finishFilter * uFinishVariation * 0.035, 0.05, 1.0);
    `);
  };
  material.customProgramCacheKey = () => `lokam-clean-v3-${finish}`;
  return material;
}