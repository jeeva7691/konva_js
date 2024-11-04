import { reactive, ref } from 'vue'
import type { DrawingToolState, Point, Shape } from '@/types/drawing.ts'

export const useDrawing = () => {
  const state = reactive<DrawingToolState>({
    currentTool: 'brush',
    brushColor: '#000000',
    borderSize: 5,
    opacity: 1,
    isErasing: false,
    lockSegmentation: false,
    overwriteMode: 'overwrite',
    currentTaxonomy: ''
  })

  const shapes = ref<Shape[]>([])
  const selectedShape = ref<Shape | null>(null)
  const isDrawing = ref(false)
  const currentPoints = ref<Point[]>([])

  const startDrawing = (point: Point) => {
    isDrawing.value = true
    currentPoints.value = [point]
  }

  const continueDrawing = (point: Point) => {
    if (!isDrawing.value) return
    currentPoints.value.push(point)
  }

  const endDrawing = () => {
    if (currentPoints.value.length < 2) {
      isDrawing.value = false
      currentPoints.value = []
      return
    }

    const newShape: Shape = {
      id: crypto.randomUUID(),
      points: [...currentPoints.value],
      color: state.brushColor,
      strokeWidth: state.borderSize,
      opacity: state.opacity,
      locked: false,
      taxonomy: state.currentTaxonomy || undefined
    }

    shapes.value.push(newShape)
    isDrawing.value = false
    currentPoints.value = []
  }

  const toggleShapeLock = (shape: Shape) => {
    shape.locked = !shape.locked
    if (shape.locked && selectedShape.value?.id === shape.id) {
      selectedShape.value = null
    }
  }

  const deleteShape = (shapeId: string) => {
    shapes.value = shapes.value.filter(s => s.id !== shapeId)
    if (selectedShape.value?.id === shapeId) {
      selectedShape.value = null
    }
  }

  return {
    state,
    shapes,
    selectedShape,
    isDrawing,
    currentPoints,
    startDrawing,
    continueDrawing,
    endDrawing,
    toggleShapeLock,
    deleteShape
  }
}