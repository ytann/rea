# Routing Table

Maps detected target formats to REA providers and CLI command workflows. Generated from `scripts/lib/target.mjs`; keep in sync when `route()` changes.

| format   | provider   | workflow                                                                              | required_engines |
| -------- | ---------- | ------------------------------------------------------------------------------------- | ---------------- |
| apk      | jadx       | inspect-apk-signature, inspect-android-package, decompile                             | jadx             |
| ipa      | filesystem | extract-artifact, inspect-macho, inspect-plist                                        |                  |
| web      | browser    | observe-web-execution, inspect-web-network-capture, inspect-web-page                  |                  |
| deb      | filesystem | inspect-artifact, extract-artifact                                                    |                  |
| exe      | ghidra     | inspect-binary-layout, inspect-pe-imports, inspect-pe-resources, inspect-with-objdump | ghidra           |
| pe       | ghidra     | inspect-binary-layout, inspect-pe-imports, inspect-pe-resources, inspect-with-objdump | ghidra           |
| elf      | ghidra     | inspect-binary-layout, inspect-elf-notes, inspect-with-objdump                        | ghidra           |
| macho    | ghidra     | inspect-macho, inspect-binary-layout                                                  | ghidra           |
| js       | browser    | analyze-web-bundle, analyze-javascript-application                                    |                  |
| py       | filesystem | analyze, inspect-python-pyc                                                           |                  |
| go       | ghidra     | inspect-go-binary, inspect-binary-layout                                              | ghidra           |
| rust     | ghidra     | inspect-rust-binary, inspect-binary-layout                                            | ghidra           |
| dotnet   | filesystem | inspect-managed-artifact                                                              |                  |
| firmware | filesystem | inspect-firmware-regions, extract-firmware                                            |                  |
| pcap     | tshark     | inspect-packet-capture, inspect-packet-fields                                         | tshark           |
| sqlite   | sqlite     | inspect-sqlite-database                                                               |                  |
| unknown  | filesystem | inspect-artifact                                                                      |                  |
