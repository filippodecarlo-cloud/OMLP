#!/usr/bin/env node

/**
 * Simple icon generator for PWA
 * Creates colored square PNG icons with text
 * No external dependencies required
 */

const fs = require('fs');
const { createCanvas } = require('canvas');

const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

function generateIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#4a90e2');
    gradient.addColorStop(1, '#357abd');
    ctx.fillStyle = gradient;

    // Draw rounded rectangle
    const radius = size * 0.15;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Draw production line representation
    const stationSize = size * 0.08;
    const stationY = size * 0.4;
    const startX = size * 0.15;
    const spacing = size * 0.15;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

    // Draw 5 stations
    for (let i = 0; i < 5; i++) {
        const x = startX + (i * spacing);

        // Station box
        ctx.fillRect(x, stationY, stationSize, stationSize);

        // Arrow between stations
        if (i < 4) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = size * 0.01;
            const arrowX = x + stationSize + (spacing - stationSize) / 2;
            ctx.beginPath();
            ctx.moveTo(x + stationSize + 2, stationY + stationSize / 2);
            ctx.lineTo(arrowX, stationY + stationSize / 2);
            ctx.stroke();
        }
    }

    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * 0.12}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OMLP', size / 2, size * 0.65);

    if (size >= 192) {
        ctx.font = `${size * 0.05}px Arial`;
        ctx.fillText('Simulator', size / 2, size * 0.75);
    }

    return canvas;
}

async function generateAllIcons() {
    console.log('Generating PWA icons...\n');

    for (const size of iconSizes) {
        try {
            const canvas = generateIcon(size);
            const buffer = canvas.toBuffer('image/png');
            const filename = `icon-${size}x${size}.png`;

            fs.writeFileSync(filename, buffer);
            console.log(`✓ Generated ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
        } catch (error) {
            console.error(`✗ Failed to generate ${size}x${size}:`, error.message);
        }
    }

    console.log('\n✅ All icons generated successfully!');
    console.log('\nYou can now test the PWA by:');
    console.log('1. Serving the app with a local server (e.g., python -m http.server)');
    console.log('2. Opening it in a browser');
    console.log('3. Looking for the "Install" button or prompt');
}

// Check if canvas module is available
try {
    require.resolve('canvas');
    generateAllIcons();
} catch (error) {
    console.error('❌ Error: "canvas" module not found');
    console.error('\nTo generate icons, you have two options:\n');
    console.error('Option 1: Install the canvas module');
    console.error('  npm install canvas\n');
    console.error('Option 2: Open generate-icons.html in your browser');
    console.error('  This will let you generate and download all icons\n');
    process.exit(1);
}
