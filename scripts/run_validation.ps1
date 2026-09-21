Write-Output "=== AARAGATE Autonomous Validation ==="
Write-Output "1. Environment check"

# Environment
$cwd = Get-Location | Select-Object -ExpandProperty Path
Write-Output "CWD: $cwd"
$cwd_ok = $cwd -eq 'E:\projects\AARAGATE'

git --no-pager status --short | Out-String | Set-Variable -Name git_status_str -Scope Global
Write-Output "GIT_STATUS:`n$git_status_str"

git --no-pager log --oneline -1 | Out-String | Set-Variable -Name git_head -Scope Global
Write-Output "GIT_HEAD:`n$git_head"

git --no-pager diff --stat | Out-String | Set-Variable -Name git_diff_stat -Scope Global
Write-Output "GIT_DIFF_STAT:`n$git_diff_stat"

$untracked = git --no-pager ls-files --others --exclude-standard | Out-String
Write-Output "UNTRACKED:$untracked"

# Remove temp scripts from this session
$clean =Remove-Item scripts\inspect_state.ps1, scripts\run_validation.ps1, scripts\validate.ps1, scripts\validate_supabase.ps1 -ErrorAction SilentlyContinue; $true
Write-Output "Temp scripts cleaned: $clean"

Write-Output ""
Write-Output "2. TypeScript typecheck"
$tsc_log = Join-Path $env:TEMP "aaragate_tsc_$PID.txt"
$tsc_start = Get-Date
npx tsc --noEmit --pretty false > $tsc_log 2>&1
$tsc_exit = $LASTEXITCODE
$tsc_elapsed = ((Get-Date) - $tsc_start).TotalSeconds.ToString("0.00")
$tsc_tail = Get-Content $tsc_log -Tail 5 | Out-String
Remove-Item $tsc_log -ErrorAction SilentlyContinue
Write-Output "tsc exit=$tsc_exit elapsed=${tsc_elapsed}s"
Write-Output "tsc tail:`n$tsc_tail"

Write-Output ""
Write-Output "3. Targeted tests (sample-paper + quiz + practice)"
$vt_log = Join-Path $env:TEMP "aaragate_vt_$PID.txt"
$vt_start = Get-Date
npx vitest run tests/sample-paper.test.ts tests/quiz.test.ts tests/practice.test.ts > $vt_log 2>&1
$vt_exit = $LASTEXITCODE
$vt_elapsed = ((Get-Date) - $vt_start).TotalSeconds.ToString("0.00")
$vt_tail = Get-Content $vt_log -Tail 8 | Out-String
$vt_summary = Select-String $vt_log -Pattern 'Test Files\s+\d+ passed \(\d+\)|Test Files\s+\d+ failed' | Select-Object -Last 1
Remove-Item $vt_log -ErrorAction SilentlyContinue
Write-Output "vitest exit=$vt_exit elapsed=${vt_elapsed}s"
if ($vt_summary) { Write-Output "vitest summary:`n$($vt_summary.Line)" }
Write-Output "vitest tail:`n$vt_tail"

Write-Output ""
Write-Output "4. Full test suite (npm test)"
$ft_log = Join-Path $env:TEMP "aaragate_ft_$PID.txt"
$ft_start = Get-Date
npx vitest run > $ft_log 2>&1
$ft_exit = $LASTEXITCODE
$ft_elapsed = ((Get-Date) - $ft_start).TotalSeconds.ToString("0.00")
$ft_tail = Get-Content $ft_log -Tail 10 | Out-String
$ft_summary = Select-String $ft_log -Pattern 'Test Files\s+\d+ passed \(\d+\)|Test Files\s+\d+ failed' | Select-Object -Last 1
Remove-Item $ft_log -ErrorAction SilentlyContinue
Write-Output "full-test exit=$ft_exit elapsed=${ft_elapsed}s"
if ($ft_summary) { Write-Output "full-test summary:`n$($ft_summary.Line)" }
Write-Output "full-test tail:`n$ft_tail"

Write-Output ""
Write-Output "5. Production build"
$bl_log = Join-Path $env:TEMP "aaragate_build_$PID.txt"
$bl_start = Get-Date
npx next build > $bl_log 2>&1
$bl_exit = $LASTEXITCODE
$bl_elapsed = ((Get-Date) - $bl_start).TotalSeconds.ToString("0.00")
$bl_tail = Get-Content $bl_log -Tail 20 | Out-String
Remove-Item $bl_log -ErrorAction SilentlyContinue
Write-Output "build exit=$bl_exit elapsed=${bl_elapsed}s"
Write-Output "build tail:`n$bl_tail"

Write-Output ""
Write-Output "6. Secrets and accidental files check"
$env_local = if (Test-Path .env.local) { "PRESENT" } else { "absent" }
$env_node = if (Test-Path .env.node) { "PRESENT" } else { "absent" }
$env = if (Test-Path .env) { "PRESENT" } else { "absent" }
Write-Output ".env.local=$env_local .env.node=$env_node .env=$env"

$all_env = @()
Get-ChildItem -Recurse -Depth 2 -File | Where-Object { $_.Name -match '^\.env' } | ForEach-Object { $all_env += $_.FullName }
Write-Output "All .env files:`n$($all_env -join "`n")"

$secrets_in_git = git --no-pager grep -IlE 'sk-[A-Za-z0-9]{20,}|pk-[A-Za-z0-9]{20,}|([a-zA-Z0-9+/]{40,}=)|(\beyaml\)[\s\S]*password|service_role' . 2>$null | Out-String
Write-Output "Secrets matched by git grep (empty=clean):`n$secrets_in_git"

Write-Output ""
Write-Output "=== VALIDATION COMPLETE ==="
