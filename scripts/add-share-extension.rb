#!/usr/bin/env ruby
#
# Add a "ShareExtension" iOS app extension target to App.xcodeproj.
# Idempotent — safe to re-run; bails out if the target already exists.
#
# Usage:  ruby scripts/add-share-extension.rb
#
require "xcodeproj"

ROOT = File.expand_path("..", __dir__)
PROJECT_PATH = File.join(ROOT, "ios/App/App.xcodeproj")
EXT_DIR = File.join(ROOT, "ios/App/ShareExtension")
EXT_NAME = "ShareExtension"
EXT_BUNDLE_ID = "com.noticomax.app.ShareExtension"
TEAM_ID = ENV["APPLE_TEAM_ID"] || "XJ2JD24RGF"
DEPLOYMENT_TARGET = "15.0"

abort "Project not found: #{PROJECT_PATH}" unless File.exist?(PROJECT_PATH)
abort "Extension dir not found: #{EXT_DIR}" unless File.directory?(EXT_DIR)

project = Xcodeproj::Project.open(PROJECT_PATH)

existing_target = project.targets.find { |t| t.name == EXT_NAME }
if existing_target
  puts "Target #{EXT_NAME} already present — refreshing build settings."
  existing_target.build_configurations.each do |config|
    config.build_settings.merge!(
      "PRODUCT_NAME" => "$(TARGET_NAME)",
      "PRODUCT_BUNDLE_IDENTIFIER" => EXT_BUNDLE_ID,
      "INFOPLIST_FILE" => "ShareExtension/Info.plist",
      "DEVELOPMENT_TEAM" => TEAM_ID,
      "CODE_SIGN_STYLE" => "Automatic",
      "SWIFT_VERSION" => "5.0",
      "IPHONEOS_DEPLOYMENT_TARGET" => DEPLOYMENT_TARGET,
      "TARGETED_DEVICE_FAMILY" => "1,2",
      "SKIP_INSTALL" => "YES",
      "GENERATE_INFOPLIST_FILE" => "NO",
    )
  end
  project.save
  puts "✓ ShareExtension settings refreshed."
  exit 0
end

# 1. Create the appex target.
ext_target = project.new_target(
  :app_extension,
  EXT_NAME,
  :ios,
  DEPLOYMENT_TARGET,
)

# 2. Add files. xcodeproj groups mirror the on-disk folder for clarity.
group = project.main_group.new_group(EXT_NAME, "ShareExtension")
swift_ref = group.new_reference(File.join(EXT_DIR, "ShareViewController.swift"))
plist_ref = group.new_reference(File.join(EXT_DIR, "Info.plist"))

ext_target.source_build_phase.add_file_reference(swift_ref, true)

# 3. Build settings — signing, plist path, swift version, bundle id.
ext_target.build_configurations.each do |config|
  config.build_settings.merge!(
    "PRODUCT_NAME" => "$(TARGET_NAME)",
    "PRODUCT_BUNDLE_IDENTIFIER" => EXT_BUNDLE_ID,
    "INFOPLIST_FILE" => "ShareExtension/Info.plist",
    "DEVELOPMENT_TEAM" => TEAM_ID,
    "CODE_SIGN_STYLE" => "Automatic",
    "SWIFT_VERSION" => "5.0",
    "IPHONEOS_DEPLOYMENT_TARGET" => DEPLOYMENT_TARGET,
    "TARGETED_DEVICE_FAMILY" => "1,2",
    "SKIP_INSTALL" => "YES",
    "GENERATE_INFOPLIST_FILE" => "NO",
  )
end

# 4. Tell the App target to embed the extension into the .app bundle.
app_target = project.targets.find { |t| t.name == "App" } or
  abort "Couldn't find main 'App' target."

embed_phase = app_target.copy_files_build_phases.find { |p| p.name == "Embed App Extensions" }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase("Embed App Extensions")
  embed_phase.symbol_dst_subfolder_spec = :plug_ins
end

product_ref = ext_target.product_reference
build_file = embed_phase.add_file_reference(product_ref)
build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

# 5. App target depends on extension so it builds first.
app_target.add_dependency(ext_target)

project.save
puts "✓ ShareExtension target added to #{PROJECT_PATH}"
