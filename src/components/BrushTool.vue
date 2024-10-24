<template>
  <div id="container"></div>
  <div class="controls">
    <input type="color" v-model="brushColor" />
    <input type="range" min="1" max="50" v-model="borderSize" />
    <button @click="lockShape">Lock</button>
    <button @click="eraseShape">Erase</button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Konva from 'konva';

const stageRef = ref<Konva.Stage | null>(null);
const layerRef = ref<Konva.Layer | null>(null);
const isDrawing = ref(false);
const selectedShape = ref<Konva.Line | null>(null);
const brushColor = ref('#000000'); // Default brush color
const borderSize = ref(5);

onMounted(() => {
  const width = 800; // Minimum width
  const height = 600; // Minimum height

  const stage = new Konva.Stage({
    container: 'container',
    width: width,
    height: height,
  });

  stageRef.value = stage;

  const layer = new Konva.Layer();
  stage.add(layer);
  layerRef.value = layer;

  let line: Konva.Line | null = null;

  stage.on('mousedown touchstart', (e) => {
    if (e.target === stage) {
      // Start drawing a new shape
      isDrawing.value = true;
      const pos = stage.getPointerPosition();
      if (pos) {
        line = new Konva.Line({
          stroke: brushColor.value, // Use the selected brush color
          strokeWidth: borderSize.value,
          lineCap: 'round',
          lineJoin: 'round',
          points: [pos.x, pos.y],
          closed: false,
        });
        layer.add(line);
      }
    } else if (e.target.attrs.dash) {
      // Prevent drawing on locked shapes
      return;
    } else {
      // Select an existing shape
      selectedShape.value = e.target as Konva.Line;
    }
  });

  stage.on('mousemove touchmove', () => {
    if (!isDrawing.value || !line) return;

    const pos = stage.getPointerPosition();
    if (pos) {
      const newPoints = line.points().concat([pos.x, pos.y]);
      line.points(newPoints);
      line.strokeWidth(borderSize.value);
      layer.batchDraw();
    }
  });

  stage.on('mouseup touchend', () => {
    isDrawing.value = false;
    if (line) {
      line.closed(true);
      line.fill(brushColor.value); // Fill with the selected brush color
      layer.batchDraw();
      line = null;
    }
  });

  stage.on('mouseenter', () => {
    stage.container().style.cursor = 'crosshair';
  });

  stage.on('mouseleave', () => {
    stage.container().style.cursor = 'default';
  });
});

function lockShape() {
  if (selectedShape.value) {
    selectedShape.value.listening(false); // Lock the shape

    // Add a dotted overlay to indicate the shape is locked
    const overlay = new Konva.Line({
      points: selectedShape.value.points(),
      stroke: '#ff0000', // Overlay color
      strokeWidth: selectedShape.value.strokeWidth(),
      dash: [10, 5], // Dotted line pattern
      closed: true,
    });

    layerRef.value?.add(overlay);
    layerRef.value?.batchDraw();

    selectedShape.value = null; // Deselect the shape
  }
}

function eraseShape() {
  if (selectedShape.value) {
    selectedShape.value.destroy(); // Erase the shape
    layerRef.value?.batchDraw();
    selectedShape.value = null; // Deselect the shape
  }
}
</script>

<style scoped>
#container {
  width: 800px; /* Minimum width */
  height: 600px; /* Minimum height */
  background-color: #ffffff; /* Set a visible background color */
  border: 1px solid #ccc; /* Optional: Add a border for better visibility */
}

.controls {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  gap: 10px;
}
</style>
