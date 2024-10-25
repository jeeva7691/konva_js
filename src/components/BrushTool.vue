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
const currentLine = ref<Konva.Line | null>(null);
const lastPointerPosition = ref<Konva.Vector2d | null>(null);

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
  stage.on('mousedown touchstart', (e) => {
    isDrawing.value = true;
    const pos = stage.getPointerPosition();
    if (pos) {
      lastPointerPosition.value = pos;
      if (isErasing.value) {
        startErasing(pos, layer);
      } else {
        startDrawing(pos, layer);
      }
    }
  });

  stage.on('mousemove touchmove', () => {
    if (!isDrawing.value) return;

    const pos = stage.getPointerPosition();
    if (pos && lastPointerPosition.value) {
      if (isErasing.value) {
        continueErasing(pos);
      } else {
        continueDrawing(lastPointerPosition.value, pos);
      }
      lastPointerPosition.value = pos;
    }
  });

  stage.on('mouseup touchend', () => {
    isDrawing.value = false;
    currentLine.value = null;
  });

  stage.on('mouseenter', () => {
    stage.container().style.cursor = isErasing.value ? 'crosshair' : 'default';
  });

  stage.on('mouseleave', () => {
    stage.container().style.cursor = 'default';
  });
}

function startDrawing(pos: Konva.Vector2d, layer: Konva.Layer) {
  const newLine = new Konva.Line({
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    lineCap: 'round',
    lineJoin: 'round',
    points: [pos.x, pos.y],
    globalCompositeOperation: 'source-over',
  });
  layer.add(newLine);
  currentLine.value = newLine;
}

function continueDrawing(lastPos: Konva.Vector2d, newPos: Konva.Vector2d) {
  if (currentLine.value) {
    const newPoints = currentLine.value.points().concat([newPos.x, newPos.y]);
    currentLine.value.points(newPoints);
    
    // Check if a shape is formed and fill it
    if (newPoints.length >= 6 && 
        Math.abs(newPoints[0] - newPos.x) < 5 && 
        Math.abs(newPoints[1] - newPos.y) < 5) {
      fillShape(currentLine.value);
    }
    
    layerRef.value?.batchDraw();
  }
}

function fillShape(line: Konva.Line) {
  const points = line.points();
  const shape = new Konva.Line({
    points: points,
    fill: brushColor.value,
    closed: true,
    globalCompositeOperation: 'source-over',
  });
  layerRef.value?.add(shape);
  line.destroy();
  currentLine.value = null;
}

function startErasing(pos: Konva.Vector2d, layer: Konva.Layer) {
  const newEraserLine = new Konva.Line({
    stroke: '#ffffff',
    strokeWidth: borderSize.value * 2,
    lineCap: 'round',
    lineJoin: 'round',
    points: [pos.x, pos.y],
    globalCompositeOperation: 'destination-out',
    listening: false,
  });
  layer.add(newEraserLine);
  currentLine.value = newEraserLine;
}

function continueErasing(pos: Konva.Vector2d) {
  if (currentLine.value) {
    const newPoints = currentLine.value.points().concat([pos.x, pos.y]);
    currentLine.value.points(newPoints);
    layerRef.value?.batchDraw();
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
