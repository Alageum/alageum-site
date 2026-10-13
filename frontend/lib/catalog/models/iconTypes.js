import { protectionExampleIconDefinitions } from './protectionExampleIcons.js';
import { measurementColumn2026IconDefinitions } from './measurementColumn2026Icons.js';
import { accessory2026IconDefinitions } from './accessory2026Icons.js';
import { transformer2026IconDefinitions } from './transformer2026Icons.js';
import { equipmentModelTypes } from './types.js';
import { sourceIconShapesA } from './sourceIconShapesA.js';
import { sourceIconShapesB } from './sourceIconShapesB.js';

/** Icon-only vocabulary. Adding a 2D silhouette never silently adds a 3D model. */
export const sourceIconShapes = Object.freeze({ ...sourceIconShapesA, ...sourceIconShapesB });
export const equipmentIconTypes = Object.freeze({ ...equipmentModelTypes, ...sourceIconShapes });
export const resolveIconType = type => Object.hasOwn(equipmentIconTypes, type) || Object.hasOwn(transformer2026IconDefinitions, type) || Object.hasOwn(accessory2026IconDefinitions, type) || Object.hasOwn(measurementColumn2026IconDefinitions, type) || Object.hasOwn(protectionExampleIconDefinitions, type) ? type : 'equipment';
export const equipmentIconName = type => (protectionExampleIconDefinitions[type] || measurementColumn2026IconDefinitions[type] || accessory2026IconDefinitions[type] || transformer2026IconDefinitions[type] || equipmentIconTypes[resolveIconType(type)]).name;
