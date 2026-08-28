export const CHARACTER_EXAMPLES = Object.freeze([
  {
    id: 'urban_investigator',
    label: '都市调查员',
    prompt: '一名 32 岁的东亚女性调查员，黑色齐肩短发，深绿色工装夹克，浅灰色圆领衫，炭灰色直筒长裤，黑色短靴，清醒克制的神情，写实人体比例'
  },
  {
    id: 'retired_carpenter',
    label: '退休木匠',
    prompt: '一名 68 岁的东亚男性退休木匠，短白发，面部有自然皱纹，深蓝色棉布工作衫，褐色旧工装长裤，深棕色皮鞋，体型精瘦，温和沉稳的神情，写实人体比例'
  },
  {
    id: 'emergency_doctor',
    label: '急诊医生',
    prompt: '一名 40 岁的黑人女性急诊医生，深棕色卷发束在脑后，海军蓝刷手服套装，白色运动鞋，体态健康，神情专注果断，服装布料有真实纹理，写实人体比例'
  },
  {
    id: 'bicycle_courier',
    label: '自行车快递员',
    prompt: '一名 27 岁的南亚男性自行车快递员，深棕色短发，橙红色防风夹克，黑色速干长裤，灰白色运动鞋，精瘦结实的体型，神情警觉友善，写实人体比例'
  },
  {
    id: 'orbital_pilot',
    label: '近地轨道飞行员',
    prompt: '一名 35 岁的白人女性近地轨道飞行员，金棕色短发，米白色轻型舱内飞行服，肩部和膝部有深蓝色加强面料，灰色软底靴，体型匀称，冷静自信的神情，写实科幻工业设计'
  }
])

export const DEFAULT_CHARACTER_EXAMPLE_ID = CHARACTER_EXAMPLES[0].id

export const getCharacterExample = id => CHARACTER_EXAMPLES.find(example => example.id === id) ?? null
