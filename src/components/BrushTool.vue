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
  <!-- Add transformer controls that appear when a shape is selected -->
  <div v-if="selectedShape" class="shape-controls">
    <button @click="toggleShapeLock">
      {{ isShapeLocked(selectedShape) ? '🔒' : '🔓' }}
    </button>
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

// Add new refs
const selectedShape = ref<Konva.Line | null>(null);
const lockedShapes = ref<Set<Konva.Line>>(new Set());
const transformer = ref<Konva.Transformer | null>(null);

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

  // Add transformer
  const tr = new Konva.Transformer({
    nodes: [],
    visible: false,
    rotateEnabled: false,
    borderStroke: '#00ff00',
    borderStrokeWidth: 2,
  });
  
  layerRef.value?.add(tr);
  transformer.value = tr;
});

function setupEventListeners(stage: Konva.Stage, layer: Konva.Layer) {
  stage.on('mousedown touchstart', (e) => {
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (currentTool.value === 'pen') {
      // Add point to penPoints
      penPoints.value.push(pos);

      // Draw the point
      drawPenPoint(layer, pos);

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

  // Add click handler to clear selection when clicking canvas
  stage.on('click tap', () => {
    if (stage.getPointerPosition()) {
      selectedShape.value = null;
      if (transformer.value) {
        transformer.value.visible(false);
      }
      layer.batchDraw();
    }
  });
}

function startDrawing(pos: Konva.Vector2d, layer: Konva.Layer) {
  const newLine = new Konva.Line({
    points: [pos.x, pos.y],
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    lineCap: 'round',
    lineJoin: 'round',
    globalCompositeOperation: 'source-over',
  });
  
  layer.add(newLine);
  currentLine.value = newLine;
}

function continueDrawing(lastPos: Konva.Vector2d, newPos: Konva.Vector2d) {
  if (!currentLine.value) return;

  if (currentTool.value === 'brush') {
    const newPoint = { x: newPos.x, y: newPos.y };
    
    // Check for intersections with locked shapes
    for (const shape of lockedShapes.value) {
      if (shape === currentLine.value) continue;
      
      // Check if the new point intersects with the shape
      const intersects = shape.intersects({
        x: newPos.x,
        y: newPos.y,
      });
      
      if (intersects) {
        return;
      }
    }

    const newPoints = currentLine.value.points().concat([newPoint.x, newPoint.y]);
    currentLine.value.points(newPoints);
    
    // Check if shape should be closed and filled
    if (newPoints.length >= 6 && 
        Math.abs(newPoints[0] - newPoint.x) < 5 && 
        Math.abs(newPoints[1] - newPoint.y) < 5) {
      fillShape(currentLine.value);
    }
    
    layerRef.value?.batchDraw();
  }
}

function fillShape(line: Konva.Line) {
  if (!layerRef.value) return;

  const points = line.points();
  // Create a polygon instead of a generic shape
  const shape = new Konva.Line({
    points: points,
    fill: brushColor.value,
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    closed: true,
    draggable: true,
    globalCompositeOperation: 'source-over',
  });

  setupShapeEvents(shape);
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
  if (currentLine.value) {
    // Update existing line
    const newPoints = currentLine.value.points().concat([pos.x, pos.y]);
    currentLine.value.points(newPoints);
  } else {
    // Create new line
    const newLine = new Konva.Line({
      points: penPoints.value.flatMap(p => [p.x, p.y]),
      stroke: brushColor.value,
      strokeWidth: borderSize.value,
      lineCap: 'round',
      lineJoin: 'round',
    });
    layer.add(newLine);
    currentLine.value = newLine;
  }
  layer.batchDraw();
}

function drawPenPoint(layer: Konva.Layer, pos: Konva.Vector2d) {
  const point = new Konva.Circle({
    x: pos.x,
    y: pos.y,
    radius: borderSize.value / 2,
    fill: brushColor.value,
  });
  layer.add(point);
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

// Add new functions for shape selection and locking
function setupShapeEvents(shape: Konva.Line) {
  shape.on('click tap', () => {
    if (isShapeLocked(shape)) return;
    
    selectedShape.value = shape;
    if (transformer.value) {
      transformer.value.nodes([shape]);
      transformer.value.visible(true);
    }
    layerRef.value?.batchDraw();
  });

  shape.on('mouseenter', () => {
    if (!isShapeLocked(shape)) {
      document.body.style.cursor = 'pointer';
    }
  });

  shape.on('mouseleave', () => {
    document.body.style.cursor = 'default';
  });
}

function isShapeLocked(shape: Konva.Line): boolean {
  return lockedShapes.value.has(shape);
}

function toggleShapeLock() {
  if (!selectedShape.value) return;

  if (isShapeLocked(selectedShape.value)) {
    lockedShapes.value.delete(selectedShape.value);
    selectedShape.value.draggable(true);
  } else {
    lockedShapes.value.add(selectedShape.value);
    selectedShape.value.draggable(false);
    if (transformer.value) {
      transformer.value.visible(false);
    }
    selectedShape.value = null;
  }
  layerRef.value?.batchDraw();
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
/* Add new styles */
.shape-controls {
  position: absolute;
  background: white;
  padding: 5px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  z-index: 1000;
}

.shape-controls button {
  padding: 4px 8px;
  cursor: pointer;
  font-size: 1.2em;
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.shape-controls button:hover {
  background: #f0f0f0;
}
</style>

