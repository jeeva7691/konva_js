<template>
  <div>
    <input type="file" @change="onImageUpload" accept="image/*" />
    <canvas ref="canvas" 
      @mousedown="startDrawing" 
      @mousemove="draw" 
      @mouseup="stopDrawing" 
      @mouseleave="stopDrawing"
    ></canvas>
    <div class="controls">
      <label>
        Brush Size:
        <input type="range" v-model="brushSize" min="1" max="50" />
      </label>
      <label>
        Brush Color:
        <input type="color" v-model="brushColor" />
      </label>
      <button @click="clearCanvas">Clear Canvas</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';

const canvas = ref<HTMLCanvasElement | null>(null);
const ctx = ref<CanvasRenderingContext2D | null>(null);
const isDrawing = ref(false);
const lastX = ref(0);
const lastY = ref(0);
const brushSize = ref(5);
const brushColor = ref('#000000');

const originalImage = ref<HTMLImageElement | null>(null);
let drawingLayer: ImageData | null = null;

const onImageUpload = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      originalImage.value = new Image();
      originalImage.value.onload = () => {
        if (canvas.value && ctx.value) {
          canvas.value.width = originalImage.value!.width;
          canvas.value.height = originalImage.value!.height;
          clearCanvas();
        }
      };
      originalImage.value.src = e.target?.result as string;
    };
    reader.readAsDataURL(input.files[0]);
  }
};

const startDrawing = (e: MouseEvent) => {
  isDrawing.value = true;
  [lastX.value, lastY.value] = [e.offsetX, e.offsetY];
};

const draw = (e: MouseEvent) => {
  if (!isDrawing.value || !ctx.value) return;
  ctx.value.beginPath();
  ctx.value.moveTo(lastX.value, lastY.value);
  ctx.value.lineTo(e.offsetX, e.offsetY);
  ctx.value.strokeStyle = brushColor.value;
  ctx.value.lineWidth = brushSize.value;
  ctx.value.lineCap = 'round';
  ctx.value.stroke();
  [lastX.value, lastY.value] = [e.offsetX, e.offsetY];
};

const stopDrawing = (e: MouseEvent) => {
  if (!isDrawing.value) return; // Exit if we weren't drawing
  isDrawing.value = false;
  if (ctx.value && canvas.value) {
    drawingLayer = ctx.value.getImageData(0, 0, canvas.value.width, canvas.value.height);
    checkAndFillEnclosedArea(e.offsetX, e.offsetY);
  }
};

const clearCanvas = () => {
  if (ctx.value && canvas.value) {
    ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
    if (originalImage.value) {
      ctx.value.drawImage(originalImage.value, 0, 0);
    }
    drawingLayer = ctx.value.getImageData(0, 0, canvas.value.width, canvas.value.height);
  }
};

const checkAndFillEnclosedArea = (x: number, y: number) => {
  if (!ctx.value || !canvas.value || !drawingLayer) return;

  console.log(`Checking for enclosed area at (${x}, ${y})`);

  // Move slightly inward from the stroke to find a potential fill point
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of offsets) {
    const newX = x + dx;
    const newY = y + dy;
    if (isBackgroundColor(getPixel(newX, newY))) {
      const area = floodFillCheck(newX, newY);
      if (area.length > 0 && isEnclosed(area)) {
        console.log(`Found enclosed area at (${newX}, ${newY}), filling...`);
        floodFill(newX, newY, hexToRgb(brushColor.value));
        ctx.value.putImageData(drawingLayer, 0, 0);
        return; // Exit after filling the first found area
      }
    }
  }
};

const floodFillCheck = (startX: number, startY: number): [number, number][] => {
  if (!canvas.value || !drawingLayer) return [];

  const width = canvas.value.width;
  const height = canvas.value.height;
  const stack: [number, number][] = [[startX, startY]];
  const area: [number, number][] = [];
  const visited = new Set<string>();

  while (stack.length) {
    const [x, y] = stack.pop()!;
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (!isBackgroundColor(getPixel(x, y))) continue;

    area.push([x, y]);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return area;
};

const isEnclosed = (area: [number, number][]): boolean => {
  if (!canvas.value) return false;
  const width = canvas.value.width;
  const height = canvas.value.height;
  return !area.some(([x, y]) => x === 0 || x === width - 1 || y === 0 || y === height - 1);
};

const isBackgroundColor = (color: number[]): boolean => {
  const threshold = 5;
  const backgroundColor = [255, 255, 255, 255]; // Assuming white background
  return color.every((c, i) => Math.abs(c - backgroundColor[i]) <= threshold);
};

const floodFill = (startX: number, startY: number, fillColor: number[]) => {
  if (!ctx.value || !canvas.value || !drawingLayer) return;

  const width = canvas.value.width;
  const height = canvas.value.height;
  const stack: [number, number][] = [[startX, startY]];
  const targetColor = getPixel(startX, startY);
  const visited = new Set<string>();

  while (stack.length) {
    const [x, y] = stack.pop()!;
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (!colorMatch(getPixel(x, y), targetColor)) continue;

    setPixel(x, y, fillColor);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
};

const setPixel = (x: number, y: number, color: number[]) => {
  if (!drawingLayer) return;
  const index = (y * drawingLayer.width + x) * 4;
  drawingLayer.data.set(color, index);
};

const getPixel = (x: number, y: number): number[] => {
  if (!drawingLayer) return [0, 0, 0, 0];
  const index = (y * drawingLayer.width + x) * 4;
  return Array.from(drawingLayer.data.subarray(index, index + 4));
};

const colorMatch = (color1: number[], color2: number[], tolerance = 5): boolean => {
  return color1.every((c, i) => Math.abs(c - color2[i]) <= tolerance);
};

// const isTransparentOrWhite = (color: Uint8ClampedArray): boolean => {
//   return color[3] === 0 || (color[0] === 255 && color[1] === 255 && color[2] === 255);
// };

// const compareColor = (color1: Uint8ClampedArray | number[], color2: number[]): boolean => {
//   const threshold = 5; // Allow small differences in color
//   return Math.abs(color1[0] - color2[0]) <= threshold &&
//          Math.abs(color1[1] - color2[1]) <= threshold &&
//          Math.abs(color1[2] - color2[2]) <= threshold &&
//          Math.abs(color1[3] - color2[3]) <= threshold;
// };

const hexToRgb = (hex: string): number[] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
    255
  ] : [0, 0, 0, 255];
};

onMounted(() => {
  if (canvas.value) {
    ctx.value = canvas.value.getContext('2d');
    canvas.value.width = 500;  // Set a default width
    canvas.value.height = 500; // Set a default height
    clearCanvas();
  }
});

watch([brushSize, brushColor], () => {
  if (ctx.value) {
    ctx.value.lineWidth = brushSize.value;
    ctx.value.strokeStyle = brushColor.value;
  }
});
</script>

<style scoped>
canvas {
  border: 1px solid #000;
}
.controls {
  margin-top: 10px;
}
.controls label, .controls button {
  margin-right: 10px;
}
</style>
