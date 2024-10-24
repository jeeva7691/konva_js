<template>
  <div id="container"></div>
  <div class="controls">
    <input type="color" v-model="brushColor" />
    <input type="range" min="1" max="50" v-model="brushSize" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Konva from 'konva';

const stageRef = ref<Konva.Stage | null>(null);
const layerRef = ref<Konva.Layer | null>(null);
const isDrawing = ref(false);
const brushColor = ref('#000000'); // Default brush color
const brushSize = ref(5);

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

  stage.on('mousedown touchstart', () => {
    isDrawing.value = true;
    const pos = stage.getPointerPosition();
    if (pos) {
      line = new Konva.Line({
        stroke: brushColor.value,
        strokeWidth: brushSize.value,
        lineCap: 'round',
        lineJoin: 'round',
        points: [pos.x, pos.y],
        closed: true, // Close the shape
        fill: brushColor.value, // Fill with the selected color
      });
      layer.add(line);
    }
  });

  stage.on('mousemove touchmove', () => {
    if (!isDrawing.value || !line) return;

    const pos = stage.getPointerPosition();
    if (pos) {
      const newPoints = line.points().concat([pos.x, pos.y]);
      line.points(newPoints);
      line.strokeWidth(brushSize.value);
      layer.batchDraw();
    }
  });

  stage.on('mouseup touchend', () => {
    isDrawing.value = false;
    if (line) {
      line.fill(brushColor.value); // Ensure the shape is filled
      line = null;
    }
  });

  stage.on('mouseenter', () => {
    stage.container().style.cursor = 'url(brush-icon.png), auto'; // Ensure this path is correct
  });

  stage.on('mouseleave', () => {
    stage.container().style.cursor = 'default';
  });
});
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
