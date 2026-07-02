import type { ModelSuggestion } from "@/lib/api"
import ModelCard from "./ModelCard"

interface ModelRankingListProps {
  suggestions: ModelSuggestion[]
  starterCode?: string
}

export default function ModelRankingList({ suggestions, starterCode }: ModelRankingListProps) {
  return (
    <div>
      {suggestions.map((s) => (
        <ModelCard key={s.rank} suggestion={s} starterCode={starterCode} />
      ))}
    </div>
  )
}
