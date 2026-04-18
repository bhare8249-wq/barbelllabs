const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG = path.join(__dirname, '../src/icon.svg');
const svgBuffer = fs.readFileSync(SVG);

const iosDir = path.join(__dirname, '../ios/App/App/Assets.xcassets/AppIcon.appiconset');
const androidRes = path.join(__dirname, '../android/app/src/main/res');
const publicDir = path.join(__dirname, '../public');

const iosSizes = [
  { name: 'AppIcon-20@1x.png',    size: 20  },
  { name: 'AppIcon-20@2x.png',    size: 40  },
  { name: 'AppIcon-20@3x.png',    size: 60  },
  { name: 'AppIcon-29@1x.png',    size: 29  },
  { name: 'AppIcon-29@2x.png',    size: 58  },
  { name: 'AppIcon-29@3x.png',    size: 87  },
  { name: 'AppIcon-40@1x.png',    size: 40  },
  { name: 'AppIcon-40@2x.png',    size: 80  },
  { name: 'AppIcon-40@3x.png',    size: 120 },
  { name: 'AppIcon-60@2x.png',    size: 120 },
  { name: 'AppIcon-60@3x.png',    size: 180 },
  { name: 'AppIcon-76@1x.png',    size: 76  },
  { name: 'AppIcon-76@2x.png',    size: 152 },
  { name: 'AppIcon-83.5@2x.png',  size: 167 },
  { name: 'AppIcon-1024@1x.png',  size: 1024},
];

const androidSizes = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

async function run() {
  fs.mkdirSync(iosDir, { recursive: true });

  for (const icon of iosSizes) {
    await sharp(svgBuffer).resize(icon.size, icon.size).png().toFile(path.join(iosDir, icon.name));
    console.log(`✓ iOS ${icon.size}px → ${icon.name}`);
  }

  for (const icon of androidSizes) {
    const dir = path.join(androidRes, icon.dir);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(svgBuffer).resize(icon.size, icon.size).png().toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(svgBuffer).resize(icon.size, icon.size).png().toFile(path.join(dir, 'ic_launcher_round.png'));
    await sharp(svgBuffer).resize(icon.size, icon.size).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
    console.log(`✓ Android ${icon.size}px → ${icon.dir}`);
  }

  // PWA + favicon
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'logo192.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'logo512.png'));
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.png'));
  console.log('✓ PWA icons (192, 512, 32px)');

  console.log('\n✅ All icons generated!');
}

run().catch(err => { console.error(err); process.exit(1); });
