export interface Museum {
  museum_id: string
  slug: string
  name: string
  description: string
  image?: {
    src: string
    alt?: string
    credit?: string
  }
  address: string
  inaguration_year: number
  tourAvailable?: boolean
  coordinates: {
    lat: number
    lon: number
  }
}
