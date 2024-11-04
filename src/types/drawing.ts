export interface DrawingToolState {
    currentTool: 'brush' | 'pen'
    brushColor: string
    borderSize: number
    opacity: number
    isErasing: boolean
    lockSegmentation: boolean
    overwriteMode: 'overwrite' | 'noOverwrite'
    currentTaxonomy: string
  }
  
  export interface Point {
    x: number
    y: number
  }
  
  export interface Shape {
    id: string
    points: Point[]
    color: string
    strokeWidth: number
    opacity: number
    locked: boolean
    taxonomy?: string
  }