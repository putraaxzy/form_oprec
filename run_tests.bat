@echo off
REM 🧪 OSIS RECRUITMENT SYSTEM - AUTOMATED TESTING SCRIPT (Windows)
REM Script untuk testing otomatis setelah refactor di Windows

echo 🚀 Starting OSIS Recruitment System Tests...
echo ===========================================

REM Test configuration
set BASE_URL=http://localhost:3000
set API_URL=%BASE_URL%/api
set TEST_RESULTS_FILE=test_results_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%.log

REM Initialize counters
set /a passed_tests=0
set /a failed_tests=0

echo Test started at %date% %time% > %TEST_RESULTS_FILE%

echo.
echo 🔄 Waiting for server to start...

REM Wait for server with timeout
set /a max_attempts=30
set /a attempt=0

:wait_loop
curl -s "%BASE_URL%/health" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Server is running
    goto start_tests
)

set /a attempt+=1
echo Attempt %attempt%/%max_attempts%...
timeout /t 2 /nobreak >nul

if %attempt% lss %max_attempts% goto wait_loop

echo ❌ Server failed to start within timeout
echo Please start the application first with: npm start
pause
exit /b 1

:start_tests
echo.
echo 🧪 Running Test Suite...
echo ========================

REM Test 1: Health Check
echo 🧪 Testing Health Check...
curl -s -w "%%{http_code}" "%BASE_URL%/health" > temp_response.txt
set /p response=<temp_response.txt
set http_code=%response:~-3%

if "%http_code%"=="200" (
    echo ✅ PASS - Health Check
    set /a passed_tests+=1
    echo %date% %time% - PASS - Health Check >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - Health Check: Expected 200, got %http_code%
    set /a failed_tests+=1
    echo %date% %time% - FAIL - Health Check - Expected 200, got %http_code% >> %TEST_RESULTS_FILE%
)

REM Test 2: API Base Endpoint  
echo 🧪 Testing API Base Endpoint...
curl -s -w "%%{http_code}" "%API_URL%/" > temp_response.txt
set /p response=<temp_response.txt
set http_code=%response:~-3%

if "%http_code%"=="200" (
    echo ✅ PASS - API Base
    set /a passed_tests+=1
    echo %date% %time% - PASS - API Base >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - API Base: Expected 200, got %http_code%
    set /a failed_tests+=1
    echo %date% %time% - FAIL - API Base - Expected 200, got %http_code% >> %TEST_RESULTS_FILE%
)

REM Test 3: Registration Page
echo 🧪 Testing Registration Page...
curl -s -w "%%{http_code}" "%BASE_URL%/register" > temp_response.txt
set /p response=<temp_response.txt
set http_code=%response:~-3%

if "%http_code%"=="200" (
    echo ✅ PASS - Registration Page
    set /a passed_tests+=1
    echo %date% %time% - PASS - Registration Page >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - Registration Page: Expected 200, got %http_code%
    set /a failed_tests+=1
    echo %date% %time% - FAIL - Registration Page - Expected 200, got %http_code% >> %TEST_RESULTS_FILE%
)

REM Test 4: Status Check Page
echo 🧪 Testing Status Check Page...
curl -s -w "%%{http_code}" "%BASE_URL%/hasil" > temp_response.txt
set /p response=<temp_response.txt
set http_code=%response:~-3%

if "%http_code%"=="200" (
    echo ✅ PASS - Status Check Page
    set /a passed_tests+=1
    echo %date% %time% - PASS - Status Check Page >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - Status Check Page: Expected 200, got %http_code%
    set /a failed_tests+=1
    echo %date% %time% - FAIL - Status Check Page - Expected 200, got %http_code% >> %TEST_RESULTS_FILE%
)

REM Test 5: Invalid Ticket Check
echo 🧪 Testing Invalid Ticket Handling...
curl -s -w "%%{http_code}" "%API_URL%/check/INVALID-TICKET" > temp_response.txt
set /p response=<temp_response.txt
set http_code=%response:~-3%

if "%http_code%"=="400" (
    echo ✅ PASS - Invalid Ticket Handling
    set /a passed_tests+=1
    echo %date% %time% - PASS - Invalid Ticket Handling >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - Invalid Ticket Handling: Expected 400, got %http_code%
    set /a failed_tests+=1
    echo %date% %time% - FAIL - Invalid Ticket Handling - Expected 400, got %http_code% >> %TEST_RESULTS_FILE%
)

REM Test 6: Directory Structure
echo 🧪 Testing Directory Structure...
set dirs_exist=1

if not exist "uploads\photos\" set dirs_exist=0
if not exist "uploads\certificates\" set dirs_exist=0
if not exist "uploads\qr-codes\" set dirs_exist=0

if %dirs_exist%==1 (
    echo ✅ PASS - Directory Structure
    set /a passed_tests+=1
    echo %date% %time% - PASS - Directory Structure >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - Directory Structure: Some directories missing
    set /a failed_tests+=1
    echo %date% %time% - FAIL - Directory Structure - Some directories missing >> %TEST_RESULTS_FILE%
)

REM Test 7: Environment File
echo 🧪 Testing Environment File...
if exist ".env" (
    echo ✅ PASS - Environment File
    set /a passed_tests+=1
    echo %date% %time% - PASS - Environment File >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - Environment File: .env file not found
    set /a failed_tests+=1
    echo %date% %time% - FAIL - Environment File - .env file not found >> %TEST_RESULTS_FILE%
)

REM Test 8: Database Health Check
echo 🧪 Testing Database Connection...
curl -s "%BASE_URL%/health" > temp_health.txt
findstr /C:"database" temp_health.txt | findstr /C:"healthy" >nul
if %errorlevel%==0 (
    echo ✅ PASS - Database Connection
    set /a passed_tests+=1
    echo %date% %time% - PASS - Database Connection >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - Database Connection: Database health check failed
    set /a failed_tests+=1
    echo %date% %time% - FAIL - Database Connection - Database health check failed >> %TEST_RESULTS_FILE%
)

REM Test 9: API Error Handling
echo 🧪 Testing API Error Handling...
curl -s -w "%%{http_code}" "%API_URL%/nonexistent" > temp_response.txt
set /p response=<temp_response.txt
set http_code=%response:~-3%

if "%http_code%"=="404" (
    echo ✅ PASS - API Error Handling
    set /a passed_tests+=1
    echo %date% %time% - PASS - API Error Handling >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - API Error Handling: Expected 404, got %http_code%
    set /a failed_tests+=1
    echo %date% %time% - FAIL - API Error Handling - Expected 404, got %http_code% >> %TEST_RESULTS_FILE%
)

REM Test 10: Package.json
echo 🧪 Testing Package Configuration...
if exist "package.json" (
    echo ✅ PASS - Package Configuration
    set /a passed_tests+=1
    echo %date% %time% - PASS - Package Configuration >> %TEST_RESULTS_FILE%
) else (
    echo ❌ FAIL - Package Configuration: package.json not found
    set /a failed_tests+=1
    echo %date% %time% - FAIL - Package Configuration - package.json not found >> %TEST_RESULTS_FILE%
)

REM Cleanup temporary files
del temp_response.txt >nul 2>&1
del temp_health.txt >nul 2>&1

REM Results Summary
echo.
echo ========================
echo 📊 Test Results Summary
echo ========================
echo ✅ Passed: %passed_tests%
echo ❌ Failed: %failed_tests%
echo 📄 Full results: %TEST_RESULTS_FILE%

set /a total_tests=%passed_tests%+%failed_tests%
if %total_tests% gtr 0 (
    set /a success_rate=%passed_tests%*100/%total_tests%
    echo 📈 Success Rate: !success_rate!%%
)

echo.
if %failed_tests%==0 (
    echo 🎉 All tests passed! System is ready for use.
    echo.
    echo 🚀 You can now:
    echo    - Access registration: %BASE_URL%/register
    echo    - Check status: %BASE_URL%/hasil
    echo    - View health: %BASE_URL%/health
    echo    - API documentation: %BASE_URL%/api
) else (
    echo ⚠️ Some tests failed. Please review the issues above.
    echo.
    echo 🔧 Common solutions:
    echo    - Ensure MySQL is running
    echo    - Check .env configuration
    echo    - Verify all dependencies installed: npm install
    echo    - Check ports are not in use
)

echo.
echo 📋 Next Steps:
echo    1. Review test results in %TEST_RESULTS_FILE%
echo    2. Fix any failing tests
echo    3. Run 'npm start' to launch the application
echo    4. Test registration flow manually
echo    5. Configure Telegram bot if needed

pause
exit /b %failed_tests%
