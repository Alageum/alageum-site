import manifest from './photography-manifest.json' with { type: 'json' };

// Editorial photographs describe their real subject, never a product specification.
const lookup = (group, id) => {
  const key = Object.hasOwn(manifest[group], id) ? manifest[group][id] : null;
  return key && Object.hasOwn(manifest.assets, key) ? { id: key, ...manifest.assets[key] } : null;
};
export const getProjectPhoto = id => lookup('projects', id);
export const getManufacturerPhoto = id => lookup('manufacturers', id);
export const getCorporatePhoto = id => lookup('corporate', id);
export const photographyManifest = manifest;
