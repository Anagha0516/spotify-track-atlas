const express = require('express');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const moodOrder = ['Euphoric', 'Calm', 'Tense', 'Somber'];
const moodDescriptions = {
  Euphoric: 'High valence · high energy',
  Calm: 'High valence · low energy',
  Tense: 'Low valence · high energy',
  Somber: 'Low valence · low energy'
};
const moodColors = {
  Euphoric: '#e77049',
  Calm: '#438875',
  Tense: '#d3a443',
  Somber: '#6c78a8'
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

function getMood(valence, energy) {
  if (valence >= 0.5 && energy >= 0.5) return 'Euphoric';
  if (valence >= 0.5) return 'Calm';
  if (energy >= 0.5) return 'Tense';
  return 'Somber';
}

function loadTracks() {
  const csv = fs.readFileSync(path.join(__dirname, 'archive', 'spotify-tracks-dataset-detailed.csv'), 'utf8');
  const rows = parse(csv, { columns: true, skip_empty_lines: true, bom: true, trim: true });
  const uniqueTracks = new Map();

  for (const row of rows) {
    const valence = Number(row.valence);
    const energy = Number(row.energy);
    const popularity = Number(row.popularity);
    if (!row.track_id || !Number.isFinite(valence) || !Number.isFinite(energy) || !Number.isFinite(popularity)) continue;

    const track = {
      id: row.track_id,
      title: row.track_name || 'Unknown track',
      artist: row.artists || 'Unknown artist',
      album: row.album_name || '',
      genre: row.track_genre || 'Unknown',
      popularity,
      valence,
      energy,
      duration: Number(row.duration_ms) || 0,
      explicit: row.explicit === 'True',
      mood: getMood(valence, energy)
    };
    const existing = uniqueTracks.get(track.id);
    if (!existing || track.popularity > existing.popularity) uniqueTracks.set(track.id, track);
  }

  return [...uniqueTracks.values()];
}

const tracks = loadTracks();
const allGenres = [...new Set(tracks.map((track) => track.genre))].sort((a, b) => a.localeCompare(b));

app.get('/', (req, res) => {
  const selectedMood = moodOrder.includes(req.query.mood) ? req.query.mood : '';
  const selectedGenre = allGenres.includes(req.query.genre) ? req.query.genre : '';
  const search = String(req.query.q || '').trim().slice(0, 100);
  const searchLower = search.toLocaleLowerCase();
  const filteredTracks = tracks.filter((track) => {
    if (selectedMood && track.mood !== selectedMood) return false;
    if (selectedGenre && track.genre !== selectedGenre) return false;
    if (searchLower && !`${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(searchLower)) return false;
    return true;
  });

  const popularityRanked = [...filteredTracks].sort((a, b) => b.popularity - a.popularity);
  const moodCounts = moodOrder.map((label) => ({
    label,
    description: moodDescriptions[label],
    color: moodColors[label],
    count: filteredTracks.filter((track) => track.mood === label).length
  }));
  const topGenres = Object.entries(filteredTracks.reduce((counts, track) => {
    counts[track.genre] = (counts[track.genre] || 0) + 1;
    return counts;
  }, {})).map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const average = (key) => filteredTracks.length
    ? filteredTracks.reduce((sum, track) => sum + track[key], 0) / filteredTracks.length
    : 0;
  const dominantMood = [...moodCounts].sort((a, b) => b.count - a.count)[0];

  res.render('index', {
    analytics: {
      total: filteredTracks.length,
      averagePopularity: average('popularity'),
      averageValence: average('valence'),
      averageEnergy: average('energy'),
      moodCounts,
      topGenres,
      topGenreMax: topGenres[0]?.count || 1,
      topSongs: popularityRanked.slice(0, 12),
      dominantMood: dominantMood?.count ? dominantMood.label : '—',
      dominantMoodColor: dominantMood?.color || '#777',
      filtered: Boolean(selectedMood || selectedGenre || search)
    },
    genres: allGenres,
    selectedMood,
    selectedGenre,
    search
  });
});

app.listen(PORT, () => {
  console.log(`Spotify Track Atlas ready at http://localhost:${PORT}`);
  console.log(`Loaded ${tracks.length.toLocaleString()} unique tracks from the archive`);
});
