<template>
  <div class="drawing-app">
    <div id="container" class="canvas-container" @click="handleCanvasClick"></div>
    
    <!-- Main controls -->
    <div class="controls">
      <div class="control-group">
        <label>Color</label>
        <input type="color" v-model="brushColor" title="Select brush color" />
      </div>
      
      <div class="control-group">
        <label>Size: {{ borderSize }}</label>
        <input 
          type="range" 
          min="1" 
          max="50" 
          v-model="borderSize" 
          title="Adjust brush size"
        />
      </div>
      
      <button 
        @click="toggleEraser"
        :class="{ active: isErasing }"
        class="tool-button"
      >
        {{ isErasing ? 'Draw' : 'Erase' }}
      </button>
      
      <div class="control-group">
        <label>Tool</label>
        <select v-model="currentTool" class="tool-select">
          <option value="brush">Brush</option>
          <option value="pen">Pen</option>
        </select>
      </div>
      
      <div class="control-group">
        <label>Opacity: {{ opacity }}</label>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.1" 
          v-model="opacity" 
          title="Adjust opacity"
        />
      </div>
    </div>

    <!-- Element Management UI -->
    <div class="element-management">
      <div class="current-element">
        <h3>Elements Management</h3>
        <button 
          @click="addNewElement" 
          class="add-element-button"
          title="Add new element"
        >
          + Add New Element
        </button>
      </div>

      <div class="elements-list">
        <h3>Elements ({{ elements.length }})</h3>
        <div class="elements-container">
          <div 
            v-for="(element, index) in elements" 
            :key="element.id"
            :class="['element-item', { 
              active: selectedElementIndex === index,
              highlighted: highlightedElementIndex === index 
            }]"
            @click.stop="selectElement(index)"
            @mouseover="highlightElement(index)"
            @mouseleave="unhighlightElement()"
          >
            <div class="element-info">
              <span class="element-name">Shape {{ index + 1 }}</span>
            </div>
            <div class="element-timestamp">
              {{ formatTimestamp(element.timestamp) }}
            </div>
            <div class="element-actions">
              <button 
                @click.stop="toggleElementVisibility(index)"
                class="visibility-button"
                :class="{ hidden: !element.isVisible }"
                title="Toggle visibility"
              >
                {{ element.isVisible ? '👁️' : '👁️‍🗨️' }}
              </button>
              <button 
                v-if="selectedElementIndex === index"
                @click.stop="toggleElementLock(index)"
                class="lock-button"
                :class="{ locked: element.shape?.isLocked }"
                title="Toggle lock"
              >
                {{ element.shape?.isLocked ? '🔒' : '🔓' }}
              </button>
              <button 
                v-if="selectedElementIndex === index"
                @click.stop="deleteElement(index)"
                class="delete-button"
                title="Delete shape"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast Notifications -->
    <div class="toast-container">
      <transition-group name="toast">
        <div 
          v-for="toast in toasts" 
          :key="toast.id"
          class="toast"
          :class="toast.type"
        >
          {{ toast.message }}
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import Konva from 'konva';

// Interfaces
interface ShapeState {
  id: string;
  type: 'line' | 'shape' | 'pen';
  coordinates: number[];
  isVisible: boolean;
  isLocked: boolean;
  color: string;
  strokeWidth: number;
  opacity: number;
  clipPath?: number[];
}

interface Element {
  id: string;
  shape: ShapeState | null;
  timestamp: number;
  isVisible: boolean;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

// Refs for canvas
const stageRef = ref<Konva.Stage | null>(null);
const mainLayer = ref<Konva.Layer | null>(null);
const highlightLayer = ref<Konva.Layer | null>(null);
const currentLine = ref<Konva.Line | null>(null);
const lastPointerPosition = ref<Konva.Vector2d | null>(null);

// Refs for drawing state
const isDrawing = ref(false);
const isErasing = ref(false);
const brushColor = ref('#000000');
const borderSize = ref(5);
const currentTool = ref<'brush' | 'pen'>('brush');
const opacity = ref(1);
const penPoints = ref<Konva.Vector2d[]>([]);

// Refs for element management
const elements = ref<Element[]>([]);
const selectedElementIndex = ref<number | null>(null);
const highlightedElementIndex = ref<number | null>(null);
const toasts = ref<Toast[]>([]);
let toastCounter = 0;

// Shapes container for easy access
const shapeRefs = new Map<string, Konva.Shape>();

// Add to the refs section near the top of the script
const shapeLayers = ref(new Map<string, Konva.Layer>());

// Initialization and setup
onMounted(() => {
  initializeStage();
  loadSavedElements();
});

function initializeStage() {
  const stage = new Konva.Stage({
    container: 'container',
    width: 800,
    height: 600,
  });
  stageRef.value = stage;

  const layer = new Konva.Layer();
  stage.add(layer);
  mainLayer.value = layer;

  const hLayer = new Konva.Layer();
  stage.add(hLayer);
  highlightLayer.value = hLayer;

  setupEventListeners(stage);
}

function setupEventListeners(stage: Konva.Stage) {
  stage.on('mousedown touchstart', handlePointerStart);
  stage.on('mousemove touchmove', handlePointerMove);
  stage.on('mouseup touchend', handlePointerEnd);
  stage.on('click tap', handleCanvasClick);
}

// Element Management
function addNewElement() {
  // Only add new element if current element has no shape
  const currentElement = selectedElementIndex.value !== null ? 
    elements.value[selectedElementIndex.value] : null;
    
  if (currentElement && !currentElement.shape) {
    showToast('Complete current shape before adding new element', 'error');
    return;
  }

  elements.value.push({
    id: crypto.randomUUID(),
    shape: null,
    timestamp: Date.now(),
    isVisible: true
  });
  
  selectedElementIndex.value = elements.value.length - 1;
  showToast('New element added', 'success');
  saveElementsToStorage();
}

function selectElement(index: number) {
  selectedElementIndex.value = selectedElementIndex.value === index ? null : index;
  updateHighlights();
}

function highlightElement(index: number) {
  if (highlightedElementIndex.value !== index) {
    highlightedElementIndex.value = index;
    updateHighlights();
  }
}

function unhighlightElement() {
  highlightedElementIndex.value = null;
  updateHighlights();
}

function updateHighlights() {
  if (!highlightLayer.value) return;

  highlightLayer.value.destroyChildren();

  elements.value.forEach((element, index) => {
    if (!element.isVisible || !element.shape) return;

    const isSelected = selectedElementIndex.value === index;
    const isHighlighted = highlightedElementIndex.value === index;

    if (isSelected || isHighlighted) {
      const shape = shapeRefs.get(element.shape.id);
      if (shape instanceof Konva.Line) {
        const highlightShape = new Konva.Line({
          points: element.shape.coordinates,
          stroke: isSelected ? 'red' : '#2196F3',
          strokeWidth: 2,
          opacity: 0.5,
          listening: false
        });
        highlightLayer.value?.add(highlightShape);
      }
    }
  });

  highlightLayer.value.batchDraw();
}

// Drawing Functions
function startDrawing(pos: Konva.Vector2d) {
  if (!mainLayer.value || selectedElementIndex.value === null) {
    showToast('Select an element before drawing', 'error');
    return;
  }

  const currentElement = elements.value[selectedElementIndex.value];
  if (currentElement.shape) {
    showToast('Element already has a shape', 'error');
    return;
  }

  const newLine = new Konva.Line({
    points: [pos.x, pos.y],
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    lineCap: 'round',
    lineJoin: 'round',
    opacity: opacity.value,
  });
  
  mainLayer.value.add(newLine);
  currentLine.value = newLine;
  isDrawing.value = true;
}

function continueDrawing(lastPos: Konva.Vector2d, newPos: Konva.Vector2d) {
  if (!currentLine.value) return;

  const points = currentLine.value.points().concat([newPos.x, newPos.y]);
  currentLine.value.points(points);
  mainLayer.value?.batchDraw();
}

function createShapeFromLine1(line: Konva.Line) {
  if (!mainLayer.value || selectedElementIndex.value === null) return;

  const points = line.points();
  const elementIndex = selectedElementIndex.value;
  
  // Create non-editable shape
  const shape = new Konva.Line({
    points,
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    closed: false,
    draggable: false,
    opacity: opacity.value,
  });

  const shapeState: ShapeState = {
    id: crypto.randomUUID(),
    type: 'shape',
    coordinates: points,
    isVisible: true,
    isLocked: true,
    color: brushColor.value,
    strokeWidth: borderSize.value,
    opacity: opacity.value
  };
  
  elements.value[elementIndex].shape = shapeState;
  elements.value[elementIndex].timestamp = Date.now();
  
  shapeRefs.set(shapeState.id, shape);
  
  mainLayer.value.add(shape);
  line.destroy();
  currentLine.value = null;
  
  updateHighlights();
  saveElementsToStorage();
  showToast('Shape created', 'success');
}

// Storage Functions
function loadSavedElements() {
  try {
    const savedElements = localStorage.getItem('drawing-elements');
    if (savedElements) {
      elements.value = JSON.parse(savedElements);
      elements.value.forEach(element => {
        if (element.shape) {
          createShapeFromState(element.shape);
        }
      });
    }
  } catch (error) {
    console.error('Error loading elements:', error);
    showToast('Error loading saved elements', 'error');
  }
}

function saveElementsToStorage() {
  try {
    localStorage.setItem('drawing-elements', JSON.stringify(elements.value));
  } catch (error) {
    console.error('Error saving elements:', error);
    showToast('Error saving elements', 'error');
  }
}

function createShapeFromState(shapeState: ShapeState) {
  if (!mainLayer.value) return;

  const shape = new Konva.Line({
    points: shapeState.coordinates,
    stroke: shapeState.color,
    strokeWidth: shapeState.strokeWidth,
    opacity: shapeState.opacity,
    closed: false,
    draggable: !shapeState.isLocked
  });

  // Restore clip if it exists
  if (shapeState.clipPath) {
    shape.clip({
      x: 0,
      y: 0,
      width: stageRef.value?.width() || 800,
      height: stageRef.value?.height() || 600,
      points: shapeState.clipPath
    });
  }

  shapeRefs.set(shapeState.id, shape);
  mainLayer.value.add(shape);

  // Setup drag handling if shape is draggable
  if (!shapeState.isLocked) {
    setupShapeDragHandling(shape, shapeState.id);
  }
}

// Event Handlers
function handlePointerStart(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
  const pos = stageRef.value?.getPointerPosition();
  if (!pos) return;

  if (isErasing.value) {
    startErasing(pos);
  } else if (currentTool.value === 'pen') {
    handlePenStart(pos);
  } else {
    startDrawing(pos);
  }
}

function handlePointerMove() {
  const pos = stageRef.value?.getPointerPosition();
  if (!pos || !isDrawing.value) return;

  if (isErasing.value) {
    continueErasing(pos);
  } else if (lastPointerPosition.value) {
    continueDrawing(lastPointerPosition.value, pos);
  }
  lastPointerPosition.value = pos;
}

function handlePointerEnd() {
  if (!isDrawing.value) return;
  
  if (currentLine.value) {
    createShapeFromLine(currentLine.value);
  }
  
  isDrawing.value = false;
  currentLine.value = null;
  penPoints.value = [];
  updateHighlights();
}

function handleCanvasClick(e: Konva.KonvaEventObject<MouseEvent>) {
  if (e.target === stageRef.value) {
    selectedElementIndex.value = null;
    updateHighlights();
  }
}

// Eraser Functions
function startErasing(pos: Konva.Vector2d) {
  isDrawing.value = true;
  continueErasing(pos);
}

function continueErasing(pos: Konva.Vector2d) {
  if (!mainLayer.value) return;

  mainLayer.value.getAllIntersections(pos).forEach(shape => {
    const shapeId = Array.from(shapeRefs.entries())
      .find(([_, s]) => s === shape)?.[0];
    
    if (shapeId) {
      const elementIndex = elements.value.findIndex(el => el.shape?.id === shapeId);
      if (elementIndex !== -1) {
        deleteElement(elementIndex);
      }
    }
  });
}

// Utility Functions
function toggleEraser() {
  isErasing.value = !isErasing.value;
  if (stageRef.value) {
    stageRef.value.container().style.cursor = isErasing.value ? 'crosshair' : 'default';
  }
}

function deleteElement(index: number) {
  const elementToDelete = elements.value[index];
  
  if (elementToDelete.shape) {
    const shape = shapeRefs.get(elementToDelete.shape.id);
    if (shape) {
      shape.destroy();
      shapeRefs.delete(elementToDelete.shape.id);
    }
  }

  elements.value.splice(index, 1);
  selectedElementIndex.value = null;
  
  mainLayer.value?.batchDraw();
  updateHighlights();
  saveElementsToStorage();
  
  showToast('Element deleted', 'success');
}

function toggleElementVisibility(index: number) {
  const element = elements.value[index];
  element.isVisible = !element.isVisible;

  if (element.shape) {
    const shape = shapeRefs.get(element.shape.id);
    if (shape) {
      shape.visible(element.isVisible);
    }
  }

  mainLayer.value?.batchDraw();
  updateHighlights();
  saveElementsToStorage();
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const toast: Toast = {
    id: toastCounter++,
    message,
    type
  };
  
  toasts.value.push(toast);
  setTimeout(() => {
    const index = toasts.value.findIndex(t => t.id === toast.id);
    if (index !== -1) {
      toasts.value.splice(index, 1);
    }
  }, 3000);
}

// Pen Tool Functions
function handlePenStart(pos: Konva.Vector2d) {
  if (selectedElementIndex.value === null) {
    showToast('Select an element before drawing', 'error');
    return;
  }

  const currentElement = elements.value[selectedElementIndex.value];
  if (currentElement.shape) {
    showToast('Element already has a shape', 'error');
    return;
  }

  penPoints.value.push(pos);
  drawPenPoint(pos);
  
  if (penPoints.value.length > 2 && isCloseToStart(pos)) {
    completePenShape();
  } else {
    updatePenLine();
  }
}

function drawPenPoint(pos: Konva.Vector2d) {
  if (!mainLayer.value) return;
  
  const point = new Konva.Circle({
    x: pos.x,
    y: pos.y,
    radius: borderSize.value / 2,
    fill: brushColor.value,
  });
  mainLayer.value.add(point);
  mainLayer.value.batchDraw();
}

function updatePenLine() {
  if (!mainLayer.value) return;
  
  if (currentLine.value) {
    currentLine.value.points(penPoints.value.flatMap(p => [p.x, p.y]));
  } else {
    currentLine.value = new Konva.Line({
      points: penPoints.value.flatMap(p => [p.x, p.y]),
      stroke: brushColor.value,
      strokeWidth: borderSize.value,
      lineCap: 'round',
      lineJoin: 'round',
    });
    mainLayer.value.add(currentLine.value);
  }
  mainLayer.value.batchDraw();
}

function completePenShape() {
  if (!mainLayer.value || selectedElementIndex.value === null) return;

  const elementIndex = selectedElementIndex.value;
  const shapeId = crypto.randomUUID();
  
  // Create non-editable pen shape
  const shape = new Konva.Line({
    points: penPoints.value.flatMap(p => [p.x, p.y]),
    fill: brushColor.value,
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    closed: true,
    draggable: false,
    opacity: opacity.value,
  });

  const shapeState: ShapeState = {
    id: shapeId,
    type: 'pen',
    coordinates: penPoints.value.flatMap(p => [p.x, p.y]),
    isVisible: true,
    isLocked: false,
    color: brushColor.value,
    strokeWidth: borderSize.value,
    opacity: opacity.value
  };
  
  elements.value[elementIndex].shape = shapeState;
  elements.value[elementIndex].timestamp = Date.now();
  
  shapeRefs.set(shapeId, shape);
  
  mainLayer.value.add(shape);
  currentLine.value?.destroy();
  currentLine.value = null;
  penPoints.value = [];
  
  updateHighlights();
  saveElementsToStorage();
  showToast('Pen shape created', 'success');
}

function isCloseToStart(pos: Konva.Vector2d): boolean {
  if (penPoints.value.length < 3) return false;
  const start = penPoints.value[0];
  const distance = Math.sqrt(
    Math.pow(pos.x - start.x, 2) + Math.pow(pos.y - start.y, 2)
  );
  return distance < 10;
}

// Watch for selection changes
watch(selectedElementIndex, (newIndex, oldIndex) => {
  updateHighlights();
});

function toggleElementLock(index: number) {
  const element = elements.value[index];
  if (!element.shape) return;
  
  element.shape.isLocked = !element.shape.isLocked;
  
  // Update the shape's draggable state
  const shape = shapeRefs.get(element.shape.id);
  if (shape) {
    shape.draggable(!element.shape.isLocked);
  }
  
  saveElementsToStorage();
  showToast(
    element.shape.isLocked ? 'Shape locked' : 'Shape unlocked',
    'info'
  );
  console.log("Shape locked:", element.shape.id);
  
}


function handleShapeIntersection(currentShape: Konva.Shape) {
  console.log('🚀 Starting handleShapeIntersection', { 
    currentShape,
    hasMainLayer: !!mainLayer.value,
    hasStage: !!stageRef.value,
    totalShapeRefs: shapeRefs.size
  });

  // Debug: Print all stored shape refs
  console.log('Current shapeRefs entries:', 
    Array.from(shapeRefs.entries()).map(([id, shape]) => ({
      id,
      shape: shape instanceof Konva.Shape,
      points: shape instanceof Konva.Line ? shape.points() : null
    }))
  );

  if (!mainLayer.value || !stageRef.value) {
    console.warn('❌ Missing mainLayer or stageRef');
    return;
  }

  // Find the current shape's ID first
  const currentShapeId = Array.from(shapeRefs.entries())
    .find(([_, s]) => s === currentShape)?.[0];
  
  console.log('Current shape ID:', currentShapeId);

  const currentBox = currentShape.getClientRect();
  const intersectingLockedShapes: Konva.Shape[] = [];

  // Find all intersecting locked shapes
  mainLayer.value.children.forEach((shape, index) => {
    if (shape === currentShape) {
      console.log(`Skipping current shape at index ${index}`);
      return;
    }

    const otherBox = shape.getClientRect();
    console.log(`Checking shape at index ${index}:`, {
      shape,
      box: otherBox,
      isKonvaShape: shape instanceof Konva.Shape,
      isKonvaLine: shape instanceof Konva.Line
    });

    if (Konva.Util.haveIntersection(currentBox, otherBox)) {
      // Try multiple methods to find the shape ID
      let shapeId: string | undefined;
      
      // Method 1: Direct lookup from shapeRefs
      const shapeEntry = Array.from(shapeRefs.entries())
        .find(([_, s]) => s === shape);
      shapeId = shapeEntry?.[0];
      
      // Method 2: Try to find by comparing coordinates (for Line shapes)
      if (!shapeId && shape instanceof Konva.Line) {
        const shapePoints = shape.points();
        shapeId = Array.from(shapeRefs.entries())
          .find(([_, s]) => 
            s instanceof Konva.Line && 
            JSON.stringify(s.points()) === JSON.stringify(shapePoints)
          )?.[0];
      }

      console.log('Found intersecting shape:', {
        shapeId,
        hasIntersection: true,
        shapeType: shape.getType(),
        points: shape instanceof Konva.Line ? shape.points() : null
      });

      if (shapeId) {
        const element = elements.value.find(el => el.shape?.id === shapeId);
        console.log('Found element for shape:', {
          elementFound: !!element,
          isLocked: element?.shape?.isLocked,
          shapeId
        });
        
        if (element?.shape?.isLocked) {
          console.log('Adding locked shape to intersections:', shapeId);
          intersectingLockedShapes.push(shape);
        }
      } else {
        console.warn('Could not find ID for intersecting shape');
      }
    }
  });

  console.log('📋 Final intersection results:', {
    totalShapes: mainLayer.value.children.length,
    intersectingShapes: intersectingLockedShapes.length,
    currentShapeId
  });


  console.log('📋 Total intersecting locked shapes:', intersectingLockedShapes.length);

  // Apply clipping
  if (intersectingLockedShapes.length > 0) {
    console.log('✂️ Processing intersections');
    
    intersectingLockedShapes.forEach(lockedShape => {
      if (!(lockedShape instanceof Konva.Line) || !(currentShape instanceof Konva.Line)) return;
      
      const lockedPoints = lockedShape.points();
      const currentPoints = currentShape.points();

      // Find the two main intersection points
      const intersections = findMainIntersectionPoints(lockedPoints, currentPoints);
      console.log('Main intersection points:', intersections);

      if (intersections.length === 2) {
        // Create two segments excluding the intersection
        const segments = createSegmentsExcludingIntersection(
          lockedPoints, 
          intersections[0], 
          intersections[1]
        );

        // Create new shapes for valid segments
        segments.forEach((segmentPoints, index) => {
          if (segmentPoints.length < 4) return;
          
          const newSegment = new Konva.Line({
            points: segmentPoints,
            stroke: lockedShape.stroke(),
            strokeWidth: lockedShape.strokeWidth(),
            tension: lockedShape.tension(),
            lineCap: 'round',
            lineJoin: 'round',
          });
          
          mainLayer.value?.add(newSegment);
        });

        // Remove original locked shape
        lockedShape.remove();
      }
    });

    mainLayer.value?.batchDraw();
  }
}

function findMainIntersectionPoints(line1Points: number[], line2Points: number[]) {
  const intersections: {x: number, y: number}[] = [];
  
  // Convert to line segments
  for (let i = 0; i < line1Points.length - 2; i += 2) {
    const l1 = {
      x1: line1Points[i],
      y1: line1Points[i + 1],
      x2: line1Points[i + 2],
      y2: line1Points[i + 3]
    };
    
    for (let j = 0; j < line2Points.length - 2; j += 2) {
      const l2 = {
        x1: line2Points[j],
        y1: line2Points[j + 1],
        x2: line2Points[j + 2],
        y2: line2Points[j + 3]
      };
      
      const intersection = lineIntersection(l1, l2);
      if (intersection && !isDuplicateIntersection(intersections, intersection)) {
        intersections.push(intersection);
      }
    }
  }
  
  // Return only the two most distant intersection points
  return findTwoMostDistantPoints(intersections);
}

function createSegmentsExcludingIntersection(
  points: number[], 
  int1: {x: number, y: number}, 
  int2: {x: number, y: number}
) {
  const segments: number[][] = [];
  let currentSegment: number[] = [];
  let isInIntersection = false;
  
  for (let i = 0; i < points.length; i += 2) {
    const point = {x: points[i], y: points[i + 1]};
    
    // Check if we're at an intersection point
    if (isPointNear(point, int1) || isPointNear(point, int2)) {
      if (!isInIntersection) {
        // End current segment
        if (currentSegment.length > 0) {
          segments.push([...currentSegment]);
        }
        currentSegment = [];
        isInIntersection = true;
      }
    } else {
      isInIntersection = false;
      currentSegment.push(point.x, point.y);
    }
  }
  
  // Add final segment if exists
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  
  return segments;
}

function isPointNear(p1: {x: number, y: number}, p2: {x: number, y: number}) {
  const threshold = 1;
  return Math.abs(p1.x - p2.x) < threshold && Math.abs(p1.y - p2.y) < threshold;
}

function isDuplicateIntersection(
  existing: {x: number, y: number}[], 
  point: {x: number, y: number}
) {
  return existing.some(p => isPointNear(p, point));
}

function findTwoMostDistantPoints(points: {x: number, y: number}[]) {
  if (points.length < 2) return points;
  
  let maxDist = 0;
  let result = [points[0], points[1]];
  
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dist = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (dist > maxDist) {
        maxDist = dist;
        result = [points[i], points[j]];
      }
    }
  }
  
  return result;
}

function lineIntersection(line1: any, line2: any) {
  const denominator = ((line2.y2 - line2.y1) * (line1.x2 - line1.x1)) - 
                     ((line2.x2 - line2.x1) * (line1.y2 - line1.y1));
                     
  if (denominator === 0) return null;
  
  const ua = (((line2.x2 - line2.x1) * (line1.y1 - line2.y1)) - 
              ((line2.y2 - line2.y1) * (line1.x1 - line2.x1))) / denominator;
              
  const ub = (((line1.x2 - line1.x1) * (line1.y1 - line2.y1)) - 
              ((line1.y2 - line1.y1) * (line1.x1 - line2.x1))) / denominator;
              
  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
  
  return {
    x: line1.x1 + (ua * (line1.x2 - line1.x1)),
    y: line1.y1 + (ua * (line1.y2 - line1.y1))
  };
}

function createShapeFromLine(line: Konva.Line) {
  if (!stageRef.value || !mainLayer.value || selectedElementIndex.value === null) return;

  const linePoints = line.points();
  const elementIndex = selectedElementIndex.value;
  const shapeId = crypto.randomUUID();

  console.log('Creating new shape with ID:', shapeId);

  const shape = new Konva.Line({
    points: linePoints,
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    closed: false,
    draggable: false,
    opacity: opacity.value,
    name: shapeId, // Add name attribute for easier identification
    id: shapeId,   // Add id attribute as backup
    customAttrs: { shapeId } // Add custom attribute as another backup
  });

  // Store the shape reference BEFORE adding to layer
  shapeRefs.set(shapeId, shape);
  console.log('Stored shape reference:', {
    shapeId,
    shape: shape instanceof Konva.Shape,
    points: shape.points()
  });

  mainLayer.value.add(shape);

  const shapeState: ShapeState = {
    id: shapeId,
    type: 'shape',
    coordinates: linePoints,
    isVisible: true,
    isLocked: false,  // Make sure shapes are locked by default
    color: brushColor.value,
    strokeWidth: borderSize.value,
    opacity: opacity.value
  };
  
  elements.value[elementIndex].shape = shapeState;
  elements.value[elementIndex].timestamp = Date.now();
  
  handleShapeIntersection(shape);
  
  line.destroy();
  currentLine.value = null;
  
  updateHighlights();
  saveElementsToStorage();
}

watch([elements, () => shapeRefs.size], ([newElements, newSize], [oldElements, oldSize]) => {
  console.log('State updated:', {
    elementsCount: newElements.length,
    shapeRefsCount: newSize,
    shapeRefsEntries: Array.from(shapeRefs.keys())
  });
});



</script>

<style scoped>
.drawing-app {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 20px;
  padding: 20px;
  height: 100vh;
  background-color: #f5f5f5;
}

.canvas-container {
  grid-column: 1;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  position: relative;
}

.controls {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 100;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  background: white;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-group label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

input[type="color"] {
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

input[type="range"] {
  width: 100px;
  cursor: pointer;
}

.tool-button {
  padding: 8px 16px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.tool-button:hover {
  background: #e0e0e0;
}

.tool-button.active {
  background: #2196F3;
  color: white;
  border-color: #1976D2;
}

.tool-select {
  padding: 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.element-management {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
}

.current-element {
  background: white;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.current-element h3 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 16px;
  font-weight: 600;
}

.add-element-button {
  width: 100%;
  padding: 12px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.add-element-button:hover {
  background: #43A047;
}

.elements-list {
  background: white;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.elements-container {
  overflow-y: auto;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.element-item {
  padding: 12px;
  background: #f8f8f8;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.element-item.active {
  background: #e3f2fd;
  border-color: #2196F3;
}

.element-item.highlighted {
  background: #fff3e0;
  border-color: #ff9800;
}

.element-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.element-name {
  font-weight: 500;
  color: #333;
}

.element-timestamp {
  font-size: 11px;
  color: #888;
}

.visibility-button, .delete-button, .lock-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 16px;
  opacity: 0.7;
  transition: all 0.2s ease;
}

.visibility-button:hover, .delete-button:hover, .lock-button:hover {
  opacity: 1;
  transform: scale(1.1);
}

.lock-button.locked {
  color: #2196F3;
  opacity: 1;
}

.element-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast {
  min-width: 250px;
  padding: 12px 16px;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.toast.success {
  background: #4CAF50;
}

.toast.error {
  background: #F44336;
}

.toast.info {
  background: #2196F3;
}

@media (max-width: 1200px) {
  .drawing-app {
    grid-template-columns: 1fr 250px;
  }
}

@media (max-width: 768px) {
  .drawing-app {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }

  .element-management {
    grid-row: 2;
    grid-column: 1;
    max-height: 300px;
  }

  .controls {
    position: static;
    margin-bottom: 12px;
  }
}
</style>