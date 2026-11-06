Add-Type -AssemblyName System.Speech
$segs = @(
  @('s1', 'This is LumaSuri. It finds facts in AI answers that have gone out of date.'),
  @('s2', 'Paste an AI answer, or scan a repo. LumaSuri checks each fact against today’s real sources.'),
  @('s3', 'Three steps: pick a sample, run the check, read the results.'),
  @('s4', 'Here is a typical AI answer about a dev stack. Check it.'),
  @('s5', 'Four out of five facts here are out of date. Each card shows what is true today, where the proof came from, and a fix you can copy.'),
  @('s6', 'Facts that are still true get a best-before date, so LumaSuri knows when to check them again.'),
  @('s7', 'Save them to Watch. When a date passes, LumaSuri checks again and shows what changed.'),
  @('s8', 'And every check is kept in History.')
)
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Zira Desktop')
$s.Rate = 1
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($seg in $segs) {
  $s.SetOutputToWaveFile("audio-tmp/$($seg[0]).wav", $fmt)
  $s.Speak($seg[1])
}
$s.Dispose()
