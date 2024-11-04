<template>
  <div class="drawing-tool">
    <!-- Canvas Container -->
    <div 
      ref="containerRef" 
      class="canvas-container"
      :style="{ width: `${props.width}px`, height: `${props.height}px` }"
    >
      <v-stage
        :config="stageConfig"
        @mousedown="startDrawing"
        @mousemove="draw"
        @mouseup="stopDrawing"
        @mouseleave="stopDrawing"
      >
        <v-layer ref="layerRef">
          <!-- Existing shapes -->
          <v-line
            v-for="shape in shapes"
            :key="shape.id"
            :config="{
              points: shape.points.flatMap(p => [p.x, p.y]),
              stroke: shape.color,
              strokeWidth: shape.strokeWidth,
              opacity: shape.opacity,
              closed: currentTool === 'pen',
              fill: currentTool === 'pen' ? shape.color : undefined,
            }"
            @click="selectShape(shape)"
          />
          <!-- Current drawing line -->
          <v-line
            v-if="isDrawing && currentPoints.length > 0"
            :config="{
              points: currentPoints.flatMap(p => [p.x, p.y]),
              stroke: brushColor,
              strokeWidth: borderSize,
              opacity: opacity,
              closed: currentTool === 'pen',
              fill: currentTool === 'pen' ? brushColor : undefined,
            }"
          />
        </v-layer>
      </v-stage>
    </div>

    <!-- Controls -->
    <div class="controls">
      <!-- Tool Selection -->
      <div class="control-group">
        <label>Tool:</label>
        <select v-model="currentTool">
          <option value="brush">Brush</option>
          <option value="pen">Pen</option>
        </select>
      </div>

      <!-- Color Picker -->
      <div class="control-group">
        <label>Color:</label>
        <input type="color" v-model="brushColor" />
      </div>

      <!-- Size Control -->
      <div class="control-group">
        <label>Size: {{ borderSize }}px</label>
        <input 
          type="range" 
          min="1" 
          max="50" 
          v-model.number="borderSize" 
        />
      </div>

      <!-- Opacity Control -->
      <div class="control-group">
        <label>Opacity: {{ opacity }}</label>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.1" 
          v-model.number="opacity" 
        />
      </div>

      <!-- Eraser -->
      <button 
        class="tool-button" 
        :class="{ active: isErasing }"
        @click="isErasing = !isErasing"
      >
        {{ isErasing ? 'Draw' : 'Erase' }}
      </button>

      <!-- Clear Canvas -->
      <button 
        class="tool-button"
        @click="clearCanvas"
      >
        Clear Canvas
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KonvaEventObject } from 'konva/lib/Node'

const props = defineProps<{
  width: number
  height: number
}>()

// Stage configuration
const stageConfig = computed(() => ({
  width: props.width,
  height: props.height
}))

// Drawing state
const currentTool = ref<'brush' | 'pen'>('brush')
const brushColor = ref('#000000')
const borderSize = ref(5)
const opacity = ref(1)
const isErasing = ref(false)
const isDrawing = ref(false)
const currentPoints = ref<{ x: number; y: number }[]>([])
const shapes = ref<Array<{
  id: string
  points: { x: number; y: number }[]
  color: string
  strokeWidth: number
  opacity: number
  closed: boolean
}>>([])

// References
const layerRef = ref<any>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// Drawing functions
const startDrawing = (e: KonvaEventObject<MouseEvent>) => {
  isDrawing.value = true
  const pos = e.target.getStage()?.getPointerPosition()
  if (pos) {
    currentPoints.value = [{ x: pos.x, y: pos.y }]
  }
}

const draw = (e: KonvaEventObject<MouseEvent>) => {
  if (!isDrawing.value) return

  const pos = e.target.getStage()?.getPointerPosition()
  if (pos) {
    if (currentTool.value === 'brush') {
      currentPoints.value.push({ x: pos.x, y: pos.y })
    } else {
      // For pen tool, update last point
      currentPoints.value = [...currentPoints.value.slice(0, -1), { x: pos.x, y: pos.y }]
    }
  }
}

const stopDrawing = () => {
  if (!isDrawing.value) return

  if (currentPoints.value.length > 1) {
    shapes.value.push({
      id: crypto.randomUUID(),
      points: [...currentPoints.value],
      color: isErasing.value ? '#ffffff' : brushColor.value,
      strokeWidth: borderSize.value,
      opacity: opacity.value,
      closed: currentTool.value === 'pen',
    })
  }

  isDrawing.value = false
  currentPoints.value = []
}

const clearCanvas = () => {
  shapes.value = []
}

const selectShape = (shape: typeof shapes.value[0]) => {
  console.log('Selected shape:', shape)
  // Implement selection logic here
}
</script>

<style scoped>
.drawing-tool {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

.canvas-container {
  border: 1px solid #ccc;
  background: white;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.control-group label {
  font-size: 14px;
  color: #666;
}

.tool-button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-button:hover {
  background: #f0f0f0;
}

.tool-button.active {
  background: #e0e0e0;
  border-color: #bbb;
}

input[type="range"] {
  width: 150px;
}

select {
  padding: 4px;
  border-radius: 4px;
  border: 1px solid #ddd;
}

input[type="color"] {
  width: 50px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 4px;
}
</style>