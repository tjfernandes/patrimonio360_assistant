export interface ChatImageMatch {
  originalImageName: string
  artifactId?: string
  score?: number
  title?: string
  inventory?: string
  artifact?: ChatArtifactResult
  navigationTarget?: ChatNavigationTarget
}

export interface ChatArtifactImage {
  originalImageName?: string
  imageId?: string
  localPath?: string
  sourceUrl?: string
  caption?: string
  altText?: string
}

export interface ChatArtifactResult {
  artifactId: string
  inventoryNumber?: string
  title?: string
  museumId?: string
  museum?: string
  category?: string
  superCategory?: string
  creator?: string
  dateOrPeriod?: string
  supportOrMaterial?: string
  technique?: string
  originHistory?: string
  incorporation?: string
  productionCenter?: string
  description?: string
  searchText?: string
  detailType?: string
  detailUrl?: string
  imageCount?: number
  images: ChatArtifactImage[]
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
  artifactResults?: ChatArtifactResult[]
  navigationTargets?: ChatNavigationTarget[]
  uploadedAssetKind?: ChatUploadKind
  uploadedAssetName?: string
  uploadedImageUrl?: string
  uploadedModelUrl?: string
  uploadedModelFormat?: ChatModelFormat
  resultsPage?: number
  resultsPageSize?: number
  resultsTotal?: number
  resultsHasMore?: boolean
  isLoadingMoreResults?: boolean
  loadMoreResultsError?: string | null
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
