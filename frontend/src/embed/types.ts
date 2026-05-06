export interface ChatImageMatch {
  originalImageName: string
  score?: number
  title?: string
  inventory?: string
}

export type ChatUploadKind = 'image' | 'model'
export type ChatLanguage = 'pt' | 'en'
export type ChatModelFormat = 'gltf' | 'obj'

export interface ChatNavigationTarget {
  overlayId: string
  panoramaKey: string
  inventoryId: string
  location?: string
  title?: string
}

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  isCenteredNotice?: boolean
  imageMatches?: ChatImageMatch[]
  navigationTargets?: ChatNavigationTarget[]
  uploadedAssetKind?: ChatUploadKind
  uploadedAssetName?: string
  uploadedImageUrl?: string
  uploadedModelUrl?: string
  uploadedModelFormat?: ChatModelFormat
}

export interface TourAssistantEmbedProps {
  museumSlug: string
  museumId: string
  museumName: string
  tourUrl: string
  backendBaseUrl?: string
  initialLanguage?: ChatLanguage
  fullscreenButtonClassName?: string
}
