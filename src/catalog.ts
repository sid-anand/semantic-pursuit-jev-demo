import type { Candidate, Family } from "./types";

const COLORS: Record<Family, string> = {
  living: "#9cff8b",
  object: "#d8c9ff",
  food: "#ffbd66",
  technology: "#64ddff",
  place: "#f286b7",
  phenomenon: "#8fa8ff",
  activity: "#ffdf6e",
  abstract: "#b1a7bd",
};

const entries: Array<[string, string, Family, string, string]> = [
  ["houseplant", "Houseplant", "living", "A living plant intentionally kept and cared for inside a building", "♧"],
  ["oak-tree", "Oak tree", "living", "A large, long-lived outdoor tree that grows acorns", "♠"],
  ["mushroom", "Mushroom", "living", "The fruiting body of a fungus, often growing from soil or decaying matter", "♙"],
  ["sunflower", "Sunflower", "living", "A tall flowering plant known for a large yellow head that follows sunlight", "☼"],
  ["cactus", "Cactus", "living", "A succulent plant adapted to dry conditions, often with spines", "✦"],
  ["coral", "Coral", "living", "A colony of tiny marine animals that builds reef structures", "≋"],
  ["octopus", "Octopus", "living", "An intelligent eight-armed marine animal", "⌁"],
  ["honeybee", "Honeybee", "living", "A social flying insect that pollinates flowers and produces honey", "⬡"],

  ["umbrella", "Umbrella", "object", "A portable canopy used for protection from rain or sun", "☂"],
  ["mirror", "Mirror", "object", "A reflective surface that shows an image of what faces it", "◇"],
  ["candle", "Candle", "object", "Wax surrounding a wick that produces light as it burns", "│"],
  ["key", "Key", "object", "A small shaped object used to open a lock", "⚿"],
  ["clock", "Clock", "object", "A device that measures and displays time", "◷"],
  ["suitcase", "Suitcase", "object", "A portable case used to carry belongings while traveling", "▣"],
  ["telescope", "Telescope", "object", "An optical instrument for observing distant objects", "⌖"],
  ["compass", "Compass", "object", "An instrument whose needle indicates geographic direction", "✥"],

  ["coffee", "Coffee", "food", "A dark caffeinated drink brewed from roasted beans", "◉"],
  ["bread", "Bread", "food", "A baked staple made primarily from flour and water", "▰"],
  ["lemon", "Lemon", "food", "A yellow citrus fruit with a sour taste", "●"],
  ["chocolate", "Chocolate", "food", "A sweet or bitter food made from cacao", "▪"],
  ["sushi", "Sushi", "food", "A Japanese dish built around seasoned rice, often with seafood", "◍"],
  ["popcorn", "Popcorn", "food", "Corn kernels expanded by heat into a light snack", "✣"],
  ["honey", "Honey", "food", "A sweet viscous substance made by bees from nectar", "⬢"],
  ["cheese", "Cheese", "food", "A food produced by coagulating milk", "◒"],

  ["smartphone", "Smartphone", "technology", "A pocket-sized networked computer primarily operated by touch", "▯"],
  ["drone", "Drone", "technology", "An unmanned aircraft controlled remotely or autonomously", "✛"],
  ["robot", "Robot", "technology", "A programmable machine capable of carrying out physical actions", "▦"],
  ["camera", "Camera", "technology", "A device that captures still images or video", "▣"],
  ["laptop", "Laptop", "technology", "A portable folding personal computer", "▱"],
  ["satellite", "Satellite", "technology", "A manufactured object placed in orbit around a celestial body", "⊕"],
  ["headphones", "Headphones", "technology", "A pair of small speakers worn over or in the ears", "∩"],
  ["calculator", "Calculator", "technology", "An electronic device used to perform numerical operations", "▤"],

  ["library", "Library", "place", "A place that organizes books and other media for reading or borrowing", "▥"],
  ["airport", "Airport", "place", "A transport hub where aircraft take off, land, and serve passengers", "⌁"],
  ["volcano", "Volcano", "place", "A geological opening or mountain that can erupt molten rock", "△"],
  ["lighthouse", "Lighthouse", "place", "A coastal tower whose light guides ships", "↟"],
  ["hospital", "Hospital", "place", "A facility where people receive medical treatment", "✚"],
  ["desert", "Desert", "place", "A dry region with very little precipitation", "⌇"],
  ["cave", "Cave", "place", "A natural underground chamber with an opening to the surface", "◓"],
  ["playground", "Playground", "place", "An outdoor area designed for children to play", "♢"],

  ["thunderstorm", "Thunderstorm", "phenomenon", "A storm with lightning and thunder, often accompanied by heavy rain", "ϟ"],
  ["rainbow", "Rainbow", "phenomenon", "A colored arc produced when light is refracted by water droplets", "⌒"],
  ["eclipse", "Eclipse", "phenomenon", "An astronomical event where one body obscures another", "◐"],
  ["fog", "Fog", "phenomenon", "A cloud of tiny water droplets close to the ground", "≋"],
  ["wildfire", "Wildfire", "phenomenon", "An uncontrolled fire spreading through vegetation", "⌁"],
  ["avalanche", "Avalanche", "phenomenon", "A rapidly moving mass of snow descending a slope", "▽"],
  ["aurora", "Aurora", "phenomenon", "Colored atmospheric lights visible near a planet's magnetic poles", "≈"],
  ["tide", "Tide", "phenomenon", "The periodic rise and fall of sea level caused mainly by gravity", "∿"],

  ["chess", "Chess", "activity", "A strategic board game between two players with sixteen pieces each", "♞"],
  ["surfing", "Surfing", "activity", "Riding a breaking ocean wave on a board", "∿"],
  ["gardening", "Gardening", "activity", "Cultivating and caring for plants", "⚘"],
  ["cooking", "Cooking", "activity", "Preparing food by combining and often heating ingredients", "♨"],
  ["painting", "Painting", "activity", "Applying pigment to a surface to create an image or design", "◩"],
  ["meditation", "Meditation", "activity", "A practice of focused attention or awareness", "○"],
  ["karaoke", "Karaoke", "activity", "Singing along to recorded music with displayed lyrics", "♪"],
  ["photography", "Photography", "activity", "Creating images by capturing light with a camera", "◎"],

  ["nostalgia", "Nostalgia", "abstract", "A sentimental longing for a remembered past", "⌛"],
  ["trust", "Trust", "abstract", "Confidence in the reliability, truth, or ability of someone or something", "∞"],
  ["luck", "Luck", "abstract", "Success or failure attributed to chance rather than one's actions", "♧"],
  ["silence", "Silence", "abstract", "The absence of sound or deliberate non-speaking", "··"],
  ["curiosity", "Curiosity", "abstract", "A desire to know, learn, or investigate", "?"],
  ["jealousy", "Jealousy", "abstract", "Resentful insecurity about attention, advantage, or possession", "◈"],
  ["freedom", "Freedom", "abstract", "The state of being able to act without coercive constraint", "↗"],
  ["time", "Time", "abstract", "The continuous progression in which events occur and change", "∞"],
];

export const CANDIDATES: Candidate[] = entries.map(([id, label, family, description, glyph]) => ({
  id,
  label,
  family,
  description,
  glyph,
  color: COLORS[family],
}));

export const CANDIDATE_BY_ID = Object.fromEntries(
  CANDIDATES.map((candidate) => [candidate.id, candidate]),
) as Record<string, Candidate>;

export const FAMILY_LABELS: Record<Family, string> = {
  living: "Living thing",
  object: "Everyday object",
  food: "Food or drink",
  technology: "Technology",
  place: "Place",
  phenomenon: "Natural phenomenon",
  activity: "Activity",
  abstract: "Abstract concept",
};
