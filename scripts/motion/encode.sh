#!/usr/bin/env bash
# Delivery encodes from a render.mjs master: two-pass x264 at a fixed bitrate, faststart, no audio.
#
#   scripts/motion/encode.sh out/story-mobile-master.mp4 out/story-mobile.mp4 2600k   # web: stays under 15 MB for a ~40s piece
#   scripts/motion/encode.sh out/story-mobile-master.mp4 out/story-mobile-6mbps.mp4 6M # share: for sending on / socials
#
# Size ≈ bitrate × duration: 2.6 Mbps × 42 s ≈ 13.7 MB. Artifact uploads cap each file at 15 MB, so scale the
# web bitrate down for longer pieces (15 MB ≈ 120 Mbit / duration).
set -euo pipefail
in="$1"; out="$2"; rate="${3:-2600k}"
FF="${FFMPEG:-}"
if [ -z "$FF" ]; then
  FF=/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2
  [ -x "$FF" ] || FF=ffmpeg
fi
log="$(mktemp -d)/pass"
"$FF" -loglevel error -y -i "$in" -c:v libx264 -preset slow -b:v "$rate" -pass 1 -passlogfile "$log" -an -f mp4 /dev/null
"$FF" -loglevel error -y -i "$in" -c:v libx264 -preset slow -b:v "$rate" -pass 2 -passlogfile "$log" \
  -pix_fmt yuv420p -profile:v high -movflags +faststart -an "$out"
ls -la "$out"
