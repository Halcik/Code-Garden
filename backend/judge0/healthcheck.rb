require "json"
require "net/http"

response = Net::HTTP.start("127.0.0.1", 2358, open_timeout: 2, read_timeout: 2) do |http|
  http.get("/languages")
end
abort "Judge0 API not ready" unless response.is_a?(Net::HTTPSuccess)
languages = JSON.parse(response.body)
JSON.parse(File.read("/api/code-garden/versions.json")).each do |python|
  expected = "Python #{python.fetch('series')} (CPython #{python.fetch('version')})"
  abort "Missing #{expected}" unless languages.any? { |language| language["name"] == expected }
end
