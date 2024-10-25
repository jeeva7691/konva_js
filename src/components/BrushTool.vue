<template>
  <div id="container"></div>
  <div class="controls">
    <input type="color" v-model="brushColor" />
    <input type="range" min="1" max="50" v-model="borderSize" />
    <button @click="toggleEraser">{{ isErasing ? 'Draw' : 'Erase' }}</button>
    <input type="file" @change="loadImage" />
    <!-- New controls -->
    <select v-model="currentTool">
      <option value="brush">Brush</option>
      <option value="pen">Pen</option>
    </select>
    <input type="range" min="0" max="1" step="0.1" v-model="opacity" />
    <input type="checkbox" v-model="lockSegmentation" />
    <select v-model="overwriteMode">
      <option value="overwrite">Overwrite unlocked segments</option>
      <option value="noOverwrite">Do not overwrite segments</option>
    </select>
    <input type="text" v-model="currentTaxonomy" placeholder="Taxonomy" />
    <button @click="createNewSegment">New Segment</button>
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

// New refs
const currentTool = ref<'brush' | 'pen'>('brush');
const opacity = ref(1);
const lockSegmentation = ref(false);
const overwriteMode = ref<'overwrite' | 'noOverwrite'>('overwrite');
const currentTaxonomy = ref('');
const segments = ref<Konva.Group[]>([]);
const penPoints = ref<Konva.Vector2d[]>([]);

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
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (currentTool.value === 'pen') {
      // Add point to penPoints
      penPoints.value.push(pos);

      // Check if the new point closes the shape
      if (penPoints.value.length > 2 && isCloseToStart(pos, penPoints.value[0])) {
        closePenShape(layer);
      } else {
        // Draw a line segment to the new point
        drawPenSegment(layer, pos);
      }
    } else {
      isDrawing.value = true;
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
    stage.container().style.cursor = currentTool.value === 'pen' ? 'crosshair' : 'default';
  });

  stage.on('mouseleave', () => {
    stage.container().style.cursor = 'default';
  });
}

function startDrawing(pos: Konva.Vector2d, layer: Konva.Layer) {
  if (currentTool.value === 'brush') {
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
  } else if (currentTool.value === 'pen') {
    penPoints.value = [pos];
    const newLine = new Konva.Line({
      points: [pos.x, pos.y],
      stroke: brushColor.value,
      strokeWidth: borderSize.value,
      opacity: opacity.value,
      lineCap: 'round',
      lineJoin: 'round',
    });
    layer.add(newLine);
    currentLine.value = newLine;
  }
}

function continueDrawing(lastPos: Konva.Vector2d, newPos: Konva.Vector2d) {
  if (!currentLine.value) {
    console.warn('No active line to continue drawing');
    return;
  }

  if (currentTool.value === 'brush') {
    const newPoints = currentLine.value.points().concat([newPos.x, newPos.y]);
    currentLine.value.points(newPoints);
    
    // Check if a shape is formed and fill it
    if (newPoints.length >= 6 && 
        Math.abs(newPoints[0] - newPos.x) < 5 && 
        Math.abs(newPoints[1] - newPos.y) < 5) {
      fillShape(currentLine.value);
    }
    
    layerRef.value?.batchDraw();
  } else if (currentTool.value === 'pen') {
    penPoints.value.push(newPos);
    currentLine.value.points(penPoints.value.flatMap(p => [p.x, p.y]));
    layerRef.value?.batchDraw();
  }
}

function fillShape(line: Konva.Line) {
  if (!layerRef.value) return;

  const points = line.points();
  const shape = new Konva.Shape({
    sceneFunc: (context, shape) => {
      context.beginPath();
      context.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) {
        context.lineTo(points[i], points[i + 1]);
      }
      context.closePath();
      context.fillStrokeShape(shape);
    },
    fill: brushColor.value,
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    closed: true,
    globalCompositeOperation: 'source-over',
  });

  layerRef.value.add(shape);
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

function endDrawing() {
  if (currentTool.value === 'pen' && penPoints.value.length > 2) {
    const shape = new Konva.Line({
      points: penPoints.value.flatMap(p => [p.x, p.y]),
      fill: brushColor.value,
      stroke: brushColor.value,
      strokeWidth: borderSize.value,
      opacity: opacity.value,
      closed: true,
    });
    layerRef.value?.add(shape);
    currentLine.value?.destroy();
    currentLine.value = null;
    penPoints.value = [];
  }
}

function createNewSegment() {
  const group = new Konva.Group({
    name: currentTaxonomy.value,
    draggable: !lockSegmentation.value,
  });
  layerRef.value?.add(group);
  segments.value.push(group);
}

// Watch for changes in brushColor and borderSize
watch([brushColor, borderSize, opacity], () => {
  if (stageRef.value) {
    stageRef.value.container().style.cursor = 'crosshair';
  }
});

// New watch for lockSegmentation
watch(lockSegmentation, (newValue) => {
  segments.value.forEach(segment => {
    segment.draggable(!newValue);
  });
});

function drawPenSegment(layer: Konva.Layer, pos: Konva.Vector2d) {
  const newLine = new Konva.Line({
    points: penPoints.value.flatMap(p => [p.x, p.y]),
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    lineCap: 'round',
    lineJoin: 'round',
  });
  layer.add(newLine);
  currentLine.value = newLine;
  layer.batchDraw();
}

function isCloseToStart(pos: Konva.Vector2d, start: Konva.Vector2d): boolean {
  const distance = Math.sqrt(Math.pow(pos.x - start.x, 2) + Math.pow(pos.y - start.y, 2));
  return distance < 10; // Adjust the threshold as needed
}

function closePenShape(layer: Konva.Layer) {
  const shape = new Konva.Line({
    points: penPoints.value.flatMap(p => [p.x, p.y]),
    fill: brushColor.value,
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    closed: true,
  });
  layer.add(shape);
  currentLine.value?.destroy();
  currentLine.value = null;
  penPoints.value = [];
  layer.batchDraw();
}
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
