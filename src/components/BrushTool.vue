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
      <button 
    v-if="selectedElementIndex !== null"
    @click="findIntersectionsWithSelected"
    class="tool-button"
    title="Find intersections"
  >
    Find Intersections
  </button>
  <button 
      @click="toggleLockedAreaEraser"
      :class="{ active: isLockedAreaErasing }"
      class="tool-button"
      title="Erase points in locked areas"
    >
      Locked Area Eraser
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
            @mouseover="() => {
      highlightElement(index);
      if (element.shape?.id) highlightShapeArea(element.shape.id);
    }"
    @mouseleave="() => {
      unhighlightElement();
      clearAreaHighlights();
    }"
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
  area?: number;
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
interface ShapeLockState {
  id: string;
  isLocked: boolean;
}
interface Point {
  x: number;
  y: number;
}

interface Intersection {
  points: Point[];
}

interface IntersectionResult {
  [key: string]: Intersection;
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
const shapeLockStates = ref<ShapeLockState[]>([]);
const areaHighlightLayer = ref<Konva.Layer | null>(null);
const isLockedAreaErasing = ref(false);

// Initialization and setup
onMounted(() => {
  initializeStage();
  loadSavedElements();
});

// Utility Functions
// Add new function to track lock states
function updateShapeLockStates() {
  shapeLockStates.value = elements.value
    .filter(element => element.shape !== null)
    .map(element => ({
      id: element.shape!.id,
      isLocked: element.shape!.isLocked
    }));
}


function initializeStage() {
  const container = document.getElementById('container');
  if (!container) return;
  const stage = new Konva.Stage({
    container: 'container',
    width: container.offsetWidth,
    height: container.offsetHeight,
  });
  stageRef.value = stage;

  const layer = new Konva.Layer();
  stage.add(layer);
  mainLayer.value = layer;

  const hLayer = new Konva.Layer();
  stage.add(hLayer);
  highlightLayer.value = hLayer;

  // Add area highlight layer
  const areaLayer = new Konva.Layer();
  stage.add(areaLayer);
  areaHighlightLayer.value = areaLayer;


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
      updateShapeLockStates();
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
// Enhanced eraser functions with comprehensive logging and improvements

function startErasing(pos: Konva.Vector2d) {
 
  isDrawing.value = true;
  continueErasing(pos);
}

function continueErasing(pos: Konva.Vector2d) {
  if (!mainLayer.value) {
    return;
  }

  const eraserRadius = borderSize.value ;

  // Find shapes to modify
  const shapes = mainLayer.value.children?.filter(
    child => child instanceof Konva.Line && child.visible()
  ) as Konva.Line[] || [];
  shapes.forEach((shape, shapeIndex) => {
    const originalPoints = [...shape.points()];
    let segments: number[][] = [[]];
    let currentSegment = 0;
    let modified = false;
    let removedPoints = 0;
    // Process points and create segments
    for (let i = 0; i < originalPoints.length; i += 2) {
      const x = originalPoints[i];
      const y = originalPoints[i + 1];
      
      const distance = Math.sqrt(
        Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2)
      );

      if (distance >= eraserRadius) {
        // Point is outside eraser radius - keep it
        segments[currentSegment].push(x, y);
      } else {
        // Point is within eraser radius - mark for removal
        modified = true;
        removedPoints++;

        // Start new segment if we have points in current segment
        if (segments[currentSegment].length > 0) {
          currentSegment++;
          segments[currentSegment] = [];
        }
      }
    }

    // Filter out empty segments and segments that are too small
    const validSegments = segments.filter(seg => seg.length >= 4);
    if (modified) {
      const shapeId = shape.id();
      
      // Handle case where all points are removed or segments are too small
      if (validSegments.length === 0) {
        
        
        // Remove from data structures
        const elementIndex = elements.value.findIndex(el => el.shape?.id === shapeId);
        if (elementIndex !== -1) {
          elements.value.splice(elementIndex, 1);
         
        }
        
        // Remove from layer and refs
        shape.destroy();
        shapeRefs.delete(shapeId);
      } else {
        // Process each valid segment
        validSegments.forEach((segmentPoints, idx) => {
          if (idx === 0) {
            // Update existing shape with first segment
            const newShape = new Konva.Line({
              points: segmentPoints,
              stroke: shape.stroke(),
              strokeWidth: shape.strokeWidth(),
              lineCap: 'round',
              lineJoin: 'round',
              tension: 0.3,
              listening: true,
              id: shapeId,
              globalCompositeOperation: 'source-over'
            });

            // Update data structures
            const elementIndex = elements.value.findIndex(el => el.shape?.id === shapeId);
            if (elementIndex !== -1) {
              elements.value[elementIndex].shape!.coordinates = [...segmentPoints];
            }

            // Replace shape in layer
            shape.destroy();
            mainLayer.value.add(newShape);
            shapeRefs.set(shapeId, newShape);
          } else {
            // Create new shapes for additional segments
            const newShapeId = crypto.randomUUID();
            const segmentShape = new Konva.Line({
              points: segmentPoints,
              stroke: shape.stroke(),
              strokeWidth: shape.strokeWidth(),
              lineCap: 'round',
              lineJoin: 'round',
              tension: 0.3,
              listening: true,
              id: newShapeId,
              globalCompositeOperation: 'source-over'
            });

            // Add new element for additional segment
            elements.value.push({
              id: crypto.randomUUID(),
              shape: {
                id: newShapeId,
                type: 'line',
                coordinates: [...segmentPoints],
                isVisible: true,
                isLocked: false,
                color: shape.stroke(),
                strokeWidth: shape.strokeWidth(),
                opacity: shape.opacity()
              },
              timestamp: Date.now(),
              isVisible: true
            });
            mainLayer.value.add(segmentShape);
            shapeRefs.set(newShapeId, segmentShape);
          }
        });
      }

      // Force layer update
      mainLayer.value.batchDraw();
    }
  });
  saveElementsToStorage();
}

// Enhanced shape creation function
async function createShapeFromLine(line: Konva.Line) {
  if (!stageRef.value || !mainLayer.value || selectedElementIndex.value === null) return;

  const linePoints = line.points();
  const elementIndex = selectedElementIndex.value;
  const shapeId = crypto.randomUUID();

  console.log('Creating new shape with ID:', shapeId);

    // Calculate area if shape is closed
    const area = calculateShapeArea(linePoints);

  const shape = new Konva.Line({
    points: linePoints,
    stroke: brushColor.value,
    strokeWidth: borderSize.value,
    closed: false,
    draggable: false,
    opacity: opacity.value,
    name: shapeId,
    id: shapeId,
    lineCap: 'round',
    lineJoin: 'round',
    tension: 0.5,
    globalCompositeOperation: 'source-over',
    listening: true
  });

  // Store the shape reference
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
    isLocked: false,
    color: brushColor.value,
    strokeWidth: borderSize.value,
    opacity: opacity.value,
    area: area
  };
  if (area > 1) {
    showToast(`Shape area: ${getFormattedArea(area)}`, 'info');
  }
  elements.value[elementIndex].shape = shapeState;
  elements.value[elementIndex].timestamp = Date.now();
  updateShapeLockStates();
  line.destroy();
  currentLine.value = null;
  
  updateHighlights();
  await eraseLockedAreas();
  saveElementsToStorage();
}


function toggleEraser() {
  isErasing.value = !isErasing.value;
  if (stageRef.value) {
    stageRef.value.container().style.cursor = isErasing.value ? 'crosshair' : 'default';
  }
}
// delete the  element 
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
  updateShapeLockStates();
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

function toggleElementLock(index: number) {
  const element = elements.value[index];
  if (!element.shape) return;
  
  element.shape.isLocked = !element.shape.isLocked;
  
  // Update the shape's draggable state
  const shape = shapeRefs.get(element.shape.id);
  if (shape) {
    shape.draggable(!element.shape.isLocked);
  }
  updateShapeLockStates();
  saveElementsToStorage();
  showToast(
    element.shape.isLocked ? 'Shape locked' : 'Shape unlocked',
    'info'
  );
  console.log("Shape locked:", element.shape.id);
  
}

// Watch 
watch(selectedElementIndex, (newIndex, oldIndex) => {
  updateHighlights();
});
watch(shapeLockStates, (newStates) => {
  console.log('Lock states updated:', newStates);
  
});
watch([elements, () => shapeRefs.size], ([newElements, newSize], [oldElements, oldSize]) => {
  console.log('State updated:', {
    elementsCount: newElements.length,
    shapeRefsCount: newSize,
    shapeRefsEntries: Array.from(shapeRefs.keys())
  });
});


// End of Watch
// trial logic
// area logic
function calculateShapeArea(points: number[]): number {
  if (points.length < 6) return 0; // Need at least 3 points (6 coordinates) for an area

  let area = 0;
  
  // Convert flat array to points array for easier processing
  const vertices: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i += 2) {
    vertices.push({
      x: points[i],
      y: points[i + 1]
    });
  }

  // Add first point to end to close the shape
  vertices.push(vertices[0]);

  // Calculate area using Shoelace formula
  for (let i = 0; i < vertices.length - 1; i++) {
    const current = vertices[i];
    const next = vertices[i + 1];
    area += (current.x * next.y) - (next.x * current.y);
  }

  // Take absolute value and divide by 2
  return Math.abs(area) / 2;
}
function getFormattedArea(area: number): string {
  if (area < 1) {
    return '< 1 px²';
  }
  return `${Math.round(area)} px²`;
}
function getShapeArea(shapeId: string): string {
  const element = elements.value.find(el => el.shape?.id === shapeId);
  if (!element?.shape?.coordinates) return 'N/A';
  
  const area = calculateShapeArea(element.shape.coordinates);
  return getFormattedArea(area);
}
// end of area logic
//highlight area logic

function highlightShapeArea(shapeId: string) {
  if (!areaHighlightLayer.value) return;

  // Clear previous highlights
  clearAreaHighlights();

  const element = elements.value.find(el => el.shape?.id === shapeId);
  if (!element?.shape?.coordinates) return;

  // Create highlight shape
  const highlightShape = new Konva.Line({
    points: element.shape.coordinates,
    closed: true,
    fill: 'rgba(255, 192, 203, 0.3)', // Light pink with transparency
    stroke: 'rgba(255, 182, 193, 0.5)', // Slightly darker pink for border
    strokeWidth: 2,
    listening: false, // Make it non-interactive
    name: 'area-highlight'
  });

  // Add area text
  const area = calculateShapeArea(element.shape.coordinates);
  const centroid = calculateCentroid(element.shape.coordinates);
  
  const areaText = new Konva.Text({
    x: centroid.x,
    y: centroid.y,
    text: getFormattedArea(area),
    fontSize: 14,
    fontFamily: 'Arial',
    fill: '#FF69B4',
    align: 'center',
    verticalAlign: 'middle',
    listening: false,
    name: 'area-text'
  });

  // Center the text
  areaText.offsetX(areaText.width() / 2);
  areaText.offsetY(areaText.height() / 2);

  areaHighlightLayer.value.add(highlightShape);
  areaHighlightLayer.value.add(areaText);
  areaHighlightLayer.value.batchDraw();
}

function clearAreaHighlights() {
  if (!areaHighlightLayer.value) return;
  
  // Remove all highlights
  const highlights = areaHighlightLayer.value.find('.area-highlight');
  const texts = areaHighlightLayer.value.find('.area-text');
  
  highlights.forEach(node => node.destroy());
  texts.forEach(node => node.destroy());
  
  areaHighlightLayer.value.batchDraw();
}

// Helper function to calculate centroid of a shape
function calculateCentroid(points: number[]): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  const totalPoints = points.length / 2;

  for (let i = 0; i < points.length; i += 2) {
    sumX += points[i];
    sumY += points[i + 1];
  }

  return {
    x: sumX / totalPoints,
    y: sumY / totalPoints
  };
}
// end of highlight area logic
// intersection logic
function findShapeIntersections(shapeId1: string, shapeId2: string): IntersectionResult | null {
  const shape1 = elements.value.find(el => el.shape?.id === shapeId1)?.shape;
  const shape2 = elements.value.find(el => el.shape?.id === shapeId2)?.shape;

  if (!shape1?.coordinates || !shape2?.coordinates) return null;

  const intersections: IntersectionResult = {};
  let intersectionCount = 0;

  // Convert coordinates to line segments
  const segments1 = getLineSegments(shape1.coordinates);
  const segments2 = getLineSegments(shape2.coordinates);

  // Check each segment pair for intersections
  segments1.forEach((seg1, i) => {
    segments2.forEach((seg2, j) => {
      const intersection = findSegmentIntersection(
        seg1.start,
        seg1.end,
        seg2.start,
        seg2.end
      );

      if (intersection) {
        intersectionCount++;
        intersections[`cut${intersectionCount}`] = {
          points: [
            { x: intersection.x, y: intersection.y },
            { x: intersection.x, y: intersection.y }
          ]
        };
      }
    });
  });

  return Object.keys(intersections).length > 0 ? intersections : null;
}
function getLineSegments(coordinates: number[]): { start: Point; end: Point }[] {
  const segments = [];
  
  for (let i = 0; i < coordinates.length - 2; i += 2) {
    segments.push({
      start: { x: coordinates[i], y: coordinates[i + 1] },
      end: { x: coordinates[i + 2], y: coordinates[i + 3] }
    });
  }

  // Add closing segment if shape is closed
  if (coordinates.length >= 4) {
    segments.push({
      start: { 
        x: coordinates[coordinates.length - 2], 
        y: coordinates[coordinates.length - 1] 
      },
      end: { 
        x: coordinates[0], 
        y: coordinates[1] 
      }
    });
  }

  return segments;
}

// Helper function to find intersection between two line segments
function findSegmentIntersection(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): Point | null {
  const denominator = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  
  if (denominator === 0) {
    return null; // Lines are parallel
  }

  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denominator;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denominator;

  // Check if intersection occurs within both line segments
  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
    return null;
  }

  return {
    x: p1.x + ua * (p2.x - p1.x),
    y: p1.y + ua * (p2.y - p1.y)
  };
}

// Optional: Add function to highlight intersection points
function highlightIntersections(intersections: IntersectionResult) {
  if (!areaHighlightLayer.value) return;

  clearIntersectionHighlights();

  Object.values(intersections).forEach(intersection => {
    intersection.points.forEach(point => {
      const highlight = new Konva.Circle({
        x: point.x,
        y: point.y,
        radius: 5,
        fill: '#FF1493',
        stroke: '#FF69B4',
        strokeWidth: 2,
        name: 'intersection-point'
      });

      areaHighlightLayer.value?.add(highlight);
    });
  });

  areaHighlightLayer.value.batchDraw();
}

function clearIntersectionHighlights() {
  if (!areaHighlightLayer.value) return;
  
  const highlights = areaHighlightLayer.value.find('.intersection-point');
  highlights.forEach(node => node.destroy());
  
  areaHighlightLayer.value.batchDraw();
}

// Example usage function
function findAndHighlightIntersections(shapeId1: string, shapeId2: string) {
  const intersections = findShapeIntersections(shapeId1, shapeId2);
  
  if (intersections) {
    console.log('Intersection points:', intersections);
    highlightIntersections(intersections);
    return intersections;
  } else {
    console.log('No intersections found');
    return null;
  }
}
function findIntersectionsWithSelected() {
  if (selectedElementIndex === null) return;
  
  const selectedShape = elements.value[selectedElementIndex.value];
  if (!selectedShape.shape?.id) return;

  // Find intersections with all other shapes
  elements.value.forEach((element, index) => {
    if (index !== selectedElementIndex.value && element.shape?.id) {
      const intersections = findAndHighlightIntersections(
        selectedShape.shape!.id,
        element.shape.id
      );
      
      if (intersections) {
        showToast(`Found ${Object.keys(intersections).length} intersection points`, 'info');
      }
    }
  });
}
// end of intersection logic
// locked area  erasing logic
async function eraseLockedAreas() {
  console.log('=== Starting Locked Area Erasing ===');
  console.log('Initial state:', {
    mainLayerExists: !!mainLayer.value,
    elementsCount: elements.value.length,
    lockStatesCount: shapeLockStates.value.length
  });
  
  if (!mainLayer.value) {
    console.warn('No main layer found, exiting');
    return;
  }

  const lockedShapes = shapeLockStates.value
    .filter(state => state.isLocked)
    .map(state => ({
      id: state.id,
      shape: elements.value.find(el => el.shape?.id === state.id)?.shape
    }))
    .filter(item => item.shape !== undefined);

  console.log('Found locked shapes:', {
    totalLocked: lockedShapes.length,
    shapes: lockedShapes.map(shape => ({
      id: shape.id,
      coordinates: shape.shape?.coordinates?.length,
      bounds: calculateShapeBounds(shape.shape?.coordinates || [])
    }))
  });

  if (lockedShapes.length === 0) {
    console.log('No locked shapes found, showing toast and exiting');
    showToast('No locked shapes found', 'info');
    return;
  }

  const shapes = mainLayer.value.children?.filter(
    child => child instanceof Konva.Line && child.visible()
  ) as Konva.Line[] || [];

  console.log('Found visible lines:', {
    totalShapes: shapes.length,
    shapeIds: shapes.map(s => s.id())
  });

  for (const shape of shapes) {
    const shapeId = shape.id();
    if (shapeLockStates.value.some(state => state.isLocked && state.id === shapeId)) {
      console.log(`Skipping locked shape ${shapeId}`);
      continue;
    }

    console.log(`\n=== Processing shape ${shapeId} ===`);
    const points = shape.points();
    console.log('Shape points:', {
      total: points.length / 2,
      first: { x: points[0], y: points[1] },
      last: { x: points[points.length - 2], y: points[points.length - 1] }
    });

    const segments: number[][] = [];
    let currentSegment: number[] = [];
    let isInside = false;
    
    // First, split into segments based on intersection
    console.log('Starting intersection analysis...');
    for (let i = 0; i < points.length; i += 2) {
      const point = { x: points[i], y: points[i + 1] };
      const wasInside = isInside;
      isInside = false;

      for (const lockedItem of lockedShapes) {
        if (lockedItem.shape && isPointInShape(point, lockedItem.shape.coordinates)) {
          isInside = true;
          console.log(`Point ${i/2} is inside shape ${lockedItem.id}:`, {
            point,
            wasInside,
            isNowInside: isInside
          });
          break;
        }
      }
      
      if (!isInside) {
        currentSegment.push(point.x, point.y);
        if (wasInside) {
          console.log(`Point ${i/2} exited locked area, starting new segment`);
        }
      } else if (!wasInside && currentSegment.length > 0) {
        console.log(`Point ${i/2} entered locked area, finishing segment:`, {
          segmentPoints: currentSegment.length / 2
        });
        segments.push([...currentSegment]);
        currentSegment = [];
      }
    }

    if (currentSegment.length > 0) {
      console.log('Adding final segment:', {
        points: currentSegment.length / 2
      });
      segments.push(currentSegment);
    }

    console.log('Segments analysis complete:', {
      totalSegments: segments.length,
      segmentLengths: segments.map(s => s.length / 2)
    });

    // Now process segments and add connecting paths
    if (segments.length >= 2) {
      const finalPoints: number[] = [];
      
      console.log('\nStarting segment connection process...');
      for (let i = 0; i < segments.length; i++) {
        const currentSegment = segments[i];
        console.log(`\nProcessing segment ${i}:`, {
          points: currentSegment.length / 2
        });
        
        finalPoints.push(...currentSegment);

        if (i < segments.length - 1) {
          const nextSegment = segments[i + 1];
          
          const startPoint = {
            x: currentSegment[currentSegment.length - 2],
            y: currentSegment[currentSegment.length - 1]
          };
          
          const endPoint = {
            x: nextSegment[0],
            y: nextSegment[1]
          };

          console.log(`Generating border path between segments ${i} and ${i+1}:`, {
            from: startPoint,
            to: endPoint,
            lockedShapePoints: lockedShapes[0].shape!.coordinates.length / 2
          });
          
          const borderPath = await generateBorderPath(
            startPoint,
            endPoint,
            lockedShapes[0].shape!.coordinates,
            5
          );

          console.log('Border path generated:', {
            totalPoints: borderPath.length,
            firstPoint: borderPath[0],
            lastPoint: borderPath[borderPath.length - 1]
          });

          for (let j = 1; j < borderPath.length - 1; j++) {
            finalPoints.push(borderPath[j].x, borderPath[j].y);
          }
        }
      }

      console.log('\nFinal path statistics:', {
        originalPoints: points.length / 2,
        finalPoints: finalPoints.length / 2,
        segments: segments.length
      });

      shape.points(finalPoints);
      
      const elementIndex = elements.value.findIndex(el => el.shape?.id === shapeId);
      if (elementIndex !== -1) {
        elements.value[elementIndex].shape!.coordinates = finalPoints;
        console.log('Updated element in storage:', {
          elementIndex,
          newPointCount: finalPoints.length / 2
        });
      }
    } else {
      console.log('Not enough segments to process:', {
        segmentCount: segments.length
      });
    }
  }

  console.log('\n=== Completing erase operation ===');
  mainLayer.value.batchDraw();
  saveElementsToStorage();
}

function calculateShapeBounds(coordinates: number[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < coordinates.length; i += 2) {
    minX = Math.min(minX, coordinates[i]);
    maxX = Math.max(maxX, coordinates[i]);
    minY = Math.min(minY, coordinates[i + 1]);
    maxY = Math.max(maxY, coordinates[i + 1]);
  }
  return { minX, maxX, minY, maxY };
}

// Update generateBorderPath to include more logging
async function generateBorderPath(startPoint: Point, endPoint: Point, borderPoints: number[], offset: number): Promise<Point[]> {
  console.log('=== Starting Border Path Generation ===');
  
  // Increase offset for better clearance
  const safeOffset = offset * 1.5; // Increased safety margin
  
  // First, project start and end points outward from the shape
  const projectPointOutward = (point: Point): Point => {
  // Find closest border segment instead of just closest point
  let closestSegmentStart = -1;
  let minDist = Infinity;
  let projectedPoint: Point = { x: 0, y: 0 };
  
  // Find closest line segment and project onto it
  for (let i = 0; i < borderPoints.length - 2; i += 2) {
    const p1 = { x: borderPoints[i], y: borderPoints[i + 1] };
    const p2 = { 
      x: borderPoints[(i + 2) % borderPoints.length], 
      y: borderPoints[(i + 3) % borderPoints.length] 
    };
    
    // Calculate projection onto line segment
    const projection = projectPointOntoSegment(point, p1, p2);
    const dist = getDistance(point, projection);
    
    if (dist < minDist) {
      minDist = dist;
      closestSegmentStart = i;
      projectedPoint = projection;
    }
  }
  
  // Calculate normal vector to the closest segment
  const p1 = { 
    x: borderPoints[closestSegmentStart], 
    y: borderPoints[closestSegmentStart + 1] 
  };
  const p2 = { 
    x: borderPoints[(closestSegmentStart + 2) % borderPoints.length], 
    y: borderPoints[(closestSegmentStart + 3) % borderPoints.length] 
  };
  
  // Calculate segment direction vector
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  // Calculate normal vector (perpendicular to segment)
  const normalX = -dy / len;
  const normalY = dx / len;
  
  // Determine if point is "inside" or "outside" the shape
  const isInside = isPointInShape(point, borderPoints);
  const direction = isInside ? -1 : 1;
  
  // Project point outward along normal vector
  return {
    x: projectedPoint.x + normalX * safeOffset * direction,
    y: projectedPoint.y + normalY * safeOffset * direction
  };
};

  const projectedStart = projectPointOutward(startPoint);
  const projectedEnd = projectPointOutward(endPoint);
  
  // Generate expanded boundary points
  const expandedBorderPoints: Point[] = [];
  for (let i = 0; i < borderPoints.length; i += 2) {
    const current = { x: borderPoints[i], y: borderPoints[i + 1] };
    const next = { 
      x: borderPoints[(i + 2) % borderPoints.length], 
      y: borderPoints[(i + 3) % borderPoints.length] 
    };
    
    // Calculate normal vector
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const normalX = -dy / len;
    const normalY = dx / len;
    
    // Add expanded point
    expandedBorderPoints.push({
      x: current.x + normalX * safeOffset,
      y: current.y + normalY * safeOffset
    });
  }
  
  // Find closest expanded border points to projected points
  let startIdx = -1;
  let endIdx = -1;
  let minStartDist = Infinity;
  let minEndDist = Infinity;
  
  for (let i = 0; i < expandedBorderPoints.length; i++) {
    const borderPoint = expandedBorderPoints[i];
    
    const startDist = Math.sqrt(
      Math.pow(projectedStart.x - borderPoint.x, 2) + 
      Math.pow(projectedStart.y - borderPoint.y, 2)
    );
    const endDist = Math.sqrt(
      Math.pow(projectedEnd.x - borderPoint.x, 2) + 
      Math.pow(projectedEnd.y - borderPoint.y, 2)
    );
    
    if (startDist < minStartDist) {
      minStartDist = startDist;
      startIdx = i;
    }
    if (endDist < minEndDist) {
      minEndDist = endDist;
      endIdx = i;
    }
  }
  
  // Generate both possible paths using expanded points

// Add validation when creating paths
const clockwisePath: Point[] = [];
for (let idx = startIdx; idx !== endIdx; idx = (idx + 1) % expandedBorderPoints.length) {
  const point = expandedBorderPoints[idx];
  if (isValidPoint(point)) {
    clockwisePath.push(point);
  }
}
if (isValidPoint(expandedBorderPoints[endIdx])) {
  clockwisePath.push(expandedBorderPoints[endIdx]);
}

const counterPath: Point[] = [];
for (let idx = startIdx; idx !== endIdx; idx = (idx - 1 + expandedBorderPoints.length) % expandedBorderPoints.length) {
  const point = expandedBorderPoints[idx];
  if (isValidPoint(point)) {
    counterPath.push(point);
  }
}
if (isValidPoint(expandedBorderPoints[endIdx])) {
  counterPath.push(expandedBorderPoints[endIdx]);
}
  
  // Choose shorter path
  const clockwiseLength = calculatePathLength(clockwisePath);
  const counterLength = calculatePathLength(counterPath);
  
  const finalPath = [
    startPoint,
    projectedStart,
    ...(clockwiseLength <= counterLength ? clockwisePath : counterPath),
    projectedEnd,
    endPoint
  ];
  
  // Smooth the path
  const smoothedPath = smoothPath(finalPath, 0.5);
  
  // Visualize for debugging
  if (mainLayer.value?.getStage()) {
    const debugLayer = new Konva.Layer();
    mainLayer.value.getStage()?.add(debugLayer);
    
    // Draw expanded boundary
    const expandedBoundary = new Konva.Line({
      points: expandedBorderPoints.flatMap(p => [p.x, p.y]),
      stroke: 'rgba(0, 255, 0, 0.3)',
      closed: true
    });
    debugLayer.add(expandedBoundary);
    
    // Draw path points
    for (const point of smoothedPath) {
      const circle = new Konva.Circle({
        x: point.x,
        y: point.y,
        radius: 2,
        fill: 'blue',
        opacity: 0.5
      });
      debugLayer.add(circle);
    }
    
    debugLayer.draw();
    
    setTimeout(() => debugLayer.destroy(), 2000);
  }
  
  return smoothedPath;
}

function smoothPath(points: Point[], tension: number): Point[] {
  if (points.length < 3) return points;
  
  const smoothedPoints: Point[] = [];
  
  // Keep start point
  smoothedPoints.push(points[0]);
  
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    
    // Calculate smoothed point
    smoothedPoints.push({
      x: curr.x + (next.x - prev.x) * tension / 2,
      y: curr.y + (next.y - prev.y) * tension / 2
    });
  }
  
  // Keep end point
  smoothedPoints.push(points[points.length - 1]);
  
  return smoothedPoints;
}

function calculatePathLength(points: Point[]): number {
  if (!points || points.length < 2) {
    console.warn('Invalid path: insufficient points', points);
    return 0;
  }

  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    // Validate point coordinates
    if (!isValidPoint(p1) || !isValidPoint(p2)) {
      console.warn('Invalid point coordinates at index', i, { p1, p2 });
      continue;
    }

    const segmentLength = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    );

    if (isNaN(segmentLength)) {
      console.warn('Invalid segment length at index', i, { p1, p2, segmentLength });
      continue;
    }

    length += segmentLength;
    console.log(`Segment ${i}: ${p1.x},${p1.y} -> ${p2.x},${p2.y} = ${segmentLength}`);
  }

  console.log('Final path length:', length);
  return length;
}

// Helper function to validate point coordinates
function isValidPoint(point: Point): boolean {
  return (
    point !== null &&
    point !== undefined &&
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    !isNaN(point.x) &&
    !isNaN(point.y) &&
    isFinite(point.x) &&
    isFinite(point.y)
  );
}

async function toggleLockedAreaEraser() {
  isLockedAreaErasing.value = !isLockedAreaErasing.value;
  isErasing.value = false;
  
  if (isLockedAreaErasing.value) {
    console.log('Locked area eraser activated - performing immediate erase');
    await eraseLockedAreas();
  }
}

// The isPointInShape function remains unchanged as it's working correctly
function isPointInShape(point: Point, shapeCoordinates: number[]): boolean {
  let inside = false;
  const x = point.x;
  const y = point.y;

  // Convert flat array to points for processing
  const vertices = [];
  for (let i = 0; i < shapeCoordinates.length; i += 2) {
    vertices.push({
      x: shapeCoordinates[i],
      y: shapeCoordinates[i + 1]
    });
  }

  // Ray casting algorithm to determine if point is inside polygon
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}
function projectPointOntoSegment(p: Point, a: Point, b: Point): Point {
  const ax = p.x - a.x;
  const ay = p.y - a.y;
  const bx = b.x - a.x;
  const by = b.y - a.y;
  
  const t = (ax * bx + ay * by) / (bx * bx + by * by);
  
  if (t < 0) return a;
  if (t > 1) return b;
  
  return {
    x: a.x + t * bx,
    y: a.y + t * by
  };
}

// Helper function to calculate distance between two points
function getDistance(p1: Point, p2: Point): number {
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) + 
    Math.pow(p2.y - p1.y, 2)
  );
}
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
  width: 100%;
  height: 100%;
  min-height: 600px;
  min-width: 800px;
}

.controls {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column;
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

.area-highlight {
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.area-text {
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.intersection-point {
  pointer-events: none;
  transition: all 0.2s ease;
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