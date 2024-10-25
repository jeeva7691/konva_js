<template>
  <div id="container"></div>
  <div class="controls">
    <input type="color" v-model="brushColor" />
    <input type="range" min="1" max="50" v-model="borderSize" />
    <button @click="toggleEraser">{{ isErasing ? 'Draw' : 'Erase' }}</button>
    <input type="file" @change="loadImage" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import Konva from 'konva';

const stageRef = ref<Konva.Stage | null>(null);
const layerRef = ref<Konva.Layer | null>(null);
const isDrawing = ref(false);
const brushColor = ref('#000000');
const borderSize = ref(5);
const imageRef = ref<Konva.Image | null>(null);
const isErasing = ref(false);

onMounted(() => {
  const stage = new Konva.Stage({
    container: 'container',
    width: 800,
    height: 600,
  });

  stageRef.value = stage;

  const layer = new Konva.Layer();
  stage.add(layer);
  layerRef.value = layer;

  setupEventListeners(stage, layer);
});

function setupEventListeners(stage: Konva.Stage, layer: Konva.Layer) {
  let line: Konva.Line | null = null;

  stage.on('mousedown touchstart', () => {
    isDrawing.value = true;
    const pos = stage.getPointerPosition();
    if (pos) {
      if (isErasing.value) {
        erase(pos);
      } else {
        line = new Konva.Line({
          stroke: brushColor.value,
          strokeWidth: borderSize.value,
          lineCap: 'round',
          lineJoin: 'round',
          points: [pos.x, pos.y],
          closed: false,
        });
        layer.add(line);
      }
    }
  });

  stage.on('mousemove touchmove', () => {
    if (!isDrawing.value) return;

    const pos = stage.getPointerPosition();
    if (pos) {
      if (isErasing.value) {
        erase(pos);
      } else if (line) {
        const newPoints = line.points().concat([pos.x, pos.y]);
        line.points(newPoints);
        layer.batchDraw();
      }
    }
  });

  stage.on('mouseup touchend', () => {
    isDrawing.value = false;
    if (line) {
      line.closed(true);
      line.fill(brushColor.value);
      layer.batchDraw();
      line = null;
    }
  });

  stage.on('mouseenter', () => {
    stage.container().style.cursor = isErasing.value ? 'crosshair' : 'default';
  });

  stage.on('mouseleave', () => {
    stage.container().style.cursor = 'default';
  });
}

function erase(pos: { x: number; y: number }) {
  const layer = layerRef.value;
  const stage = stageRef.value;
  if (!layer || !stage) return;

  const shape = stage.getIntersection(pos);
  if (shape && shape.getClassName() === 'Line') {
    shape.destroy();
    layer.batchDraw();
  }
}

function toggleEraser() {
  isErasing.value = !isErasing.value;
  if (stageRef.value) {
    stageRef.value.container().style.cursor = isErasing.value ? 'crosshair' : 'default';
  }
}

function loadImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files ? input.files[0] : null;
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const imageObj = new Image();
    imageObj.onload = () => {
      const stage = stageRef.value;
      if (stage) {
        stage.width(imageObj.width);
        stage.height(imageObj.height);
      }

      const konvaImage = new Konva.Image({
        x: 0,
        y: 0,
        image: imageObj,
        width: imageObj.width,
        height: imageObj.height,
      });
      
      if (layerRef.value) {
        layerRef.value.destroyChildren();
        layerRef.value.add(konvaImage);
        imageRef.value = konvaImage;
        layerRef.value.batchDraw();
      }
    };
    imageObj.src = e.target?.result as string;
  };
  reader.readAsDataURL(file);
}

// Watch for changes in brushColor and borderSize
watch([brushColor, borderSize], () => {
  if (stageRef.value) {
    stageRef.value.container().style.cursor = 'crosshair';
  }
});
</script>

<style scoped>
#container {
  background-color: #ffffff; 
  border: 1px solid #ccc; 
}
.controls {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  gap: 10px;
}
</style>
