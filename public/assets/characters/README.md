# Storyboard character asset

## HumanMannequin.glb

The runtime uses this CC0 Mesh2Motion / Quaternius humanoid as a neutral
storyboard proxy. CharacterRuntime preserves its original palette texture and
PBR material. ShotPlayer applies the light matte body and black outline policy
only inside the storyboard renderer.

The asset provides a single native skeleton and the locomotion/basic action
clips required by the current product scope. Runtime instances are normalized
to 1.78 meters and cloned with independent skeletons.

This asset is a spatial and motion proxy. It is not a casting, wardrobe,
facial-performance, realistic character-image, or final-render asset.
