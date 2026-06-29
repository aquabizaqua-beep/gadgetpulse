#!/usr/bin/env bash
# Generate 1200x675 branded placeholder hero images + logo + author avatars.
set -e
cd "$(dirname "$0")"
mkdir -p img
IM=convert; command -v magick >/dev/null 2>&1 && IM=magick

gen() { # slug title color
  "$IM" -size 1200x675 "gradient:${3}-#0f172a" \
    \( -size 1000x -background none -fill white -font Liberation-Sans-Bold -gravity center caption:"$2" \) \
    -gravity center -composite \
    -gravity south -fill 'rgba(255,255,255,0.85)' -font Liberation-Sans -pointsize 30 -annotate +0+38 'GadgetPulse' \
    "img/${1}.jpg"
}

gen iphone-18-pro-everything-we-know   'iPhone 18 Pro: everything we know'   '#6d28d9'
gen iphone-18-pro-vs-iphone-ultra      'iPhone 18 Pro vs iPhone Ultra'       '#6d28d9'
gen best-laptops-2026-so-far           'The best laptops of 2026 so far'     '#2563eb'
gen best-wireless-earbuds-2026         'The best wireless earbuds in 2026'   '#db2777'
gen smart-home-go-local-matter-2026    'Smart home in 2026: go local'        '#059669'
gen nintendo-switch-2-one-year-later   'Switch 2, one year later'            '#dc2626'

# logo (square)
"$IM" -size 512x512 'gradient:#6d28d9-#0f172a' -gravity center -fill white -font Liberation-Sans-Bold -pointsize 150 -annotate +0-10 'GP' -fill 'rgba(255,255,255,0.85)' -pointsize 30 -annotate +0+110 'GadgetPulse' img/logo.png

# author avatars
"$IM" -size 256x256 'gradient:#7c3aed-#4338ca' -gravity center -fill white -font Liberation-Sans-Bold -pointsize 110 -annotate +0+0 'M' img/author-maya.png
"$IM" -size 256x256 'gradient:#0891b2-#155e75' -gravity center -fill white -font Liberation-Sans-Bold -pointsize 110 -annotate +0+0 'A' img/author-alex.png

echo 'images done'
