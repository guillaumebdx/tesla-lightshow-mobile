// Centralized per-vehicle config (GLB asset, FSEQ channel count, metadata).
// Metro requires static require() calls, hence this dispatch table.

export const CAR_MODELS = {
  model_3: {
    id: 'model_3',
    label: 'Model 3/Y',
    glb: require('../assets/models/tesla_2_front_light_v2_geo.glb'),
    channelCount: 48,
    juniperExtensions: false,
    modelScale: 4.5,
    modelLift: 0, // extra Y offset applied after centering
  },
  model_y_juniper: {
    id: 'model_y_juniper',
    label: 'Model Y Juniper',
    glb: require('../assets/models/model_y_juniper_geo.glb'),
    // Juniper supports the extended 200-channel FSEQ layout:
    // front light bar (47–106), rear light bar (111–162), interior RGB (176–193)
    channelCount: 200,
    juniperExtensions: true,
    modelScale: 4.5,
    modelLift: 0,
  },
};

export function getCarModel(carModelId) {
  return CAR_MODELS[carModelId] || CAR_MODELS.model_3;
}

export function getGlbModule(carModelId) {
  return getCarModel(carModelId).glb;
}

export function getChannelCount(carModelId) {
  return getCarModel(carModelId).channelCount;
}
