import { Config } from '@remotion/cli/config';

// Standalone reel render config. Pure CSS/SVG motion graphics — no WebGL — so
// the default renderer is fine and renders reliably in headless Chromium.
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(2);
