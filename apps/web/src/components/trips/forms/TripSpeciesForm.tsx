import { XIcon } from "lucide-react"
import { Badge } from "@nasti/ui/badge"
import { Button } from "@nasti/ui/button"
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@nasti/ui/combobox"
import { type TripSpeciesWithDetails } from "@/hooks/useTripSpecies"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useDebounce } from "@uidotdev/usehooks"
import { supabase } from "@/lib/supabase"
import {
  AlaSpeciesSearchResult,
  useALASpeciesSearch,
} from "@/hooks/useALASpeciesSearch"
import { useTripSpecies } from "@/hooks/useTripSpecies"
import { Trip } from "@nasti/common/types"

export type GUID = string
export type SpeciesName = string
export type SelectedSpecies = Record<GUID, SpeciesName>

export const reduceTripSpecies = (
  tripSpecies: TripSpeciesWithDetails[] = [],
): SelectedSpecies => {
  return tripSpecies.reduce((result, { species }) => {
    result[species.ala_guid] = species.name
    return result
  }, {} as SelectedSpecies)
}

type TripSpeciesFormArgs = {
  trip?: Trip
  close: () => void
}

export const useTripSpeciesForm = ({ trip, close }: TripSpeciesFormArgs) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState("")

  const debouncedSearch = useDebounce(searchValue, 300)
  const {
    data: alaSpecies,
    isLoading: isLoadingSpeciesSearch,
    error: searchError,
  } = useALASpeciesSearch(debouncedSearch)

  useEffect(() => {
    if (searchError) setError(searchError.message)
  }, [searchError])

  const {
    data: tripSpecies,
    isLoading: isLoadingTripSpecies,
    invalidate,
  } = useTripSpecies(trip?.id)
  const [selectedSpecies, setSelectedSpecies] = useState<SelectedSpecies>(
    reduceTripSpecies(tripSpecies),
  )

  const isLoading = isLoadingTripSpecies || isLoadingSpeciesSearch

  const originalSpeciesIds = useMemo(
    () =>
      tripSpecies
        ?.map(({ species }) => species.ala_guid)
        .sort()
        .join(",") ?? "",
    [tripSpecies],
  )

  const hasSpeciesChanges = useMemo(() => {
    return originalSpeciesIds !== Object.keys(selectedSpecies).sort().join(",")
  }, [originalSpeciesIds, selectedSpecies])

  useEffect(() => {
    if (tripSpecies) {
      setSelectedSpecies(reduceTripSpecies(tripSpecies))
    }
  }, [tripSpecies])

  const handleSelectSpecies = useCallback(
    (guid: string) => {
      const thisSpecies = alaSpecies?.find((s) => s.guid === guid)
      setSelectedSpecies((selected) =>
        thisSpecies ? { ...selected, [guid]: thisSpecies.name } : selected,
      )
    },
    [alaSpecies],
  )

  const handleRemoveSpecies = useCallback((guid: string) => {
    setSelectedSpecies((selected) => {
      const { [guid]: _, ...rest } = selected
      return rest
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    try {
      if (!trip) throw new Error("No trip available")
      if (!hasSpeciesChanges) {
        close()
        return
      }

      setIsSubmitting(true)
      const currentTripSpecies = tripSpecies

      const { data: existingSpecies, error: existingSpeciesError } =
        await supabase
          .from("species")
          .select("id, ala_guid, name")
          .eq("organisation_id", trip.organisation_id)
          .in("ala_guid", Object.keys(selectedSpecies))

      if (existingSpeciesError) throw new Error(existingSpeciesError.message)

      const existingSpeciesMap = new Map(
        existingSpecies?.map((species) => [species.ala_guid, species]),
      )

      const speciesToCreate = Object.entries(selectedSpecies)
        .filter(([ala_guid]) => !existingSpeciesMap.has(ala_guid))
        .map(([ala_guid, name]) => ({
          ala_guid,
          name,
          organisation_id: trip.organisation_id,
        }))

      let newlyCreatedSpecies: Array<{ id: string; ala_guid: string | null }> =
        []
      if (speciesToCreate.length > 0) {
        const { data: createdSpecies, error: createSpeciesError } =
          await supabase
            .from("species")
            .insert(speciesToCreate)
            .select("id, ala_guid")

        if (createSpeciesError) throw new Error(createSpeciesError.message)
        newlyCreatedSpecies = createdSpecies
      }

      const allSpecies = [...(existingSpecies || []), ...newlyCreatedSpecies]

      const tripSpeciesToCreate = Object.keys(selectedSpecies)
        .filter(
          (ala_guid) =>
            !currentTripSpecies ||
            !currentTripSpecies.find((sp) => sp.species.ala_guid === ala_guid),
        )
        .map((alaGuid) => {
          const species = allSpecies.find((s) => s.ala_guid === alaGuid)
          if (!species)
            throw new Error(`Species with GUID ${alaGuid} not found`)
          return {
            trip_id: trip.id,
            species_id: species.id,
          }
        })

      if (currentTripSpecies) {
        const removedSpecies = currentTripSpecies
          .filter(
            ({ species }) =>
              !Object.keys(selectedSpecies).includes(species.ala_guid),
          )
          .map((tripSpecies) => tripSpecies.id)

        if (removedSpecies.length > 0) {
          const { error: deleteError } = await supabase
            .from("trip_species")
            .delete()
            .in("id", removedSpecies)
          if (deleteError) throw new Error(deleteError.message)
        }
      }

      const { error: createTripSpeciesError } = await supabase
        .from("trip_species")
        .upsert(tripSpeciesToCreate)

      if (createTripSpeciesError) {
        throw new Error(createTripSpeciesError.message)
      }

      setIsSubmitting(false)
      close()
      invalidate()
    } catch (err) {
      invalidate()
      setIsSubmitting(false)
      setError((err as Error).message)
    }
  }, [trip, hasSpeciesChanges, tripSpecies, selectedSpecies, close, invalidate])

  return {
    selectedSpecies,
    searchValue,
    isSubmitting,
    isLoading,
    error,
    searchResults: alaSpecies,
    onSearchChange: setSearchValue,
    onSelectSpecies: handleSelectSpecies,
    onRemoveSpecies: handleRemoveSpecies,
    onSubmit: handleSubmit,
    onSearchClose: () => setSearchValue(""),
  }
}

export interface TripSpeciesFormProps {
  selectedSpecies: SelectedSpecies
  isLoading: boolean
  error: string | null
  searchResults: AlaSpeciesSearchResult[] | undefined
  onSearchChange: (value: string) => void
  onSelectSpecies: (guid: string) => void
  onRemoveSpecies: (guid: string) => void
  onSearchClose: () => void
}

export const TripSpeciesForm = ({
  selectedSpecies,
  isLoading,
  error,
  searchResults,
  onSearchChange,
  onSelectSpecies,
  onRemoveSpecies,
  onSearchClose,
}: TripSpeciesFormProps) => {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex max-h-96 flex-wrap gap-2 overflow-scroll">
        {Object.entries(selectedSpecies).map(([guid, name]) => (
          <Badge
            key={guid}
            className="flex items-center gap-2"
            variant="outline"
          >
            <span>{name}</span>
            <Button
              title="Remove"
              onClick={() => onRemoveSpecies(guid)}
              variant="ghost"
              size="sm"
              className="p-0 hover:bg-transparent"
            >
              <XIcon className="h-4 w-4 cursor-pointer text-white" />
            </Button>
          </Badge>
        ))}
      </div>
      <Combobox
        onChange={onSelectSpecies}
        onClose={onSearchClose}
        disabled={isLoading}
      >
        <ComboboxInput
          aria-label="Species Search"
          displayValue={(species: AlaSpeciesSearchResult) => species?.name}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <ComboboxOptions anchor="bottom" className="z-[100]">
          {searchResults?.map((species) => (
            <ComboboxOption
              key={species.guid}
              value={species.guid}
              className="z-[100] flex justify-between"
            >
              <span className="italic">{species.name}</span>
              {species.commonName && <span>{species.commonName}</span>}
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </Combobox>

      {error && <div className="text-red-500">{error}</div>}
    </div>
  )
}
