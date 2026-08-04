# Storyboarder STS prototype baseline

This directory contains an internal-prototype snapshot extracted from:

- Repository: https://github.com/wonderunit/storyboarder
- Commit: `2dcf28d2d372a530ac13d71216f9532a547da6a2`
- Historical module: `src/js/shot-template-system`

The upstream STS module was removed in the next commit, `3adeefcd8296668cd719e379b42aa82f321ad57a`.

`JDLoader.min.js` is pinned to commit `f0a7cc75b` (the final 2017 STS development baseline). The 2019 tree contained a later, incompatible loader that returned a different data shape.

Local prototype-only adaptations in `index.js`:

- expose the renderer canvas;
- report asset readiness and load errors;
- add a canvas-first render method;
- skip unused perspective-grid generation during live preview.
- correct the legacy MeshLine empty dash-array check.

This code and its assets are isolated from the future independent implementation.
