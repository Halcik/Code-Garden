# Loaded inside the seed transaction, after the upstream language definitions.
require "json"

JSON.parse(File.read("/api/code-garden/versions.json")).each do |python|
  series = python.fetch("series")
  command = "/usr/local/code-garden/python-#{series}/bin/python#{series} -I -B script.py"
  # The command is stable across patch updates. Allocate an ID from THIS database,
  # never a guessed application mapping. Unscoped includes previously archived rows.
  language = Language.unscoped.find_by(run_cmd: command)
  language ||= Language.new(id: (Language.unscoped.maximum(:id) || 0) + 1)
  language.assign_attributes(
    name: "Python #{series} (CPython #{python.fetch('version')})",
    source_file: "script.py", compile_cmd: nil, run_cmd: command, is_archived: false
  )
  language.save!
end
