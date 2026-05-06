export interface Museum {
  museum_id: string
  slug: string
  name: string
  description: string
  address: string
  inaguration_year: number
  tourAvailable?: boolean
  coordinates: {
    lat: number
    lon: number
  }
}
