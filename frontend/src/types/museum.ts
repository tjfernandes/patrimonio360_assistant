export interface Museum {
  museum_id: string
  slug: string
  name: string
  description: string
  address: string
  inaguration_year: number
  coordinates: {
    lat: number
    lon: number
  }
}
