# Judge0 1.13.1's scripts/server calls db:seed at EVERY startup.
# Keep its definitions, but replace destructive delete_all with idempotent updates.
require_relative "languages/archived"
require_relative "languages/active"

ActiveRecord::Base.transaction do
  ActiveRecord::Base.connection.execute("SELECT pg_advisory_xact_lock(32003114)")
  @languages.each do |definition|
    language = Language.unscoped.find_or_initialize_by(id: definition.fetch(:id))
    language.update!(definition)
  end
  load "/api/code-garden/register-languages.rb"
end
