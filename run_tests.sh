#!/bin/bash

# 🧪 OSIS RECRUITMENT SYSTEM - AUTOMATED TESTING SCRIPT
# Script untuk testing otomatis setelah refactor

echo "🚀 Starting OSIS Recruitment System Tests..."
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api"
TEST_RESULTS_FILE="test_results_$(date +%Y%m%d_%H%M%S).log"

# Initialize test results
passed_tests=0
failed_tests=0

# Function to print test result
print_test_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✅ PASS${NC} - $test_name"
        ((passed_tests++))
    else
        echo -e "${RED}❌ FAIL${NC} - $test_name: $message"
        ((failed_tests++))
    fi
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $status - $test_name - $message" >> $TEST_RESULTS_FILE
}

# Function to wait for server
wait_for_server() {
    echo -e "${BLUE}🔄 Waiting for server to start...${NC}"
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Server is running${NC}"
            return 0
        fi
        
        ((attempt++))
        echo "Attempt $attempt/$max_attempts..."
        sleep 2
    done
    
    echo -e "${RED}❌ Server failed to start within timeout${NC}"
    return 1
}

# Test 1: Health Check
test_health_check() {
    echo -e "${BLUE}🧪 Testing Health Check...${NC}"
    
    response=$(curl -s -w "%{http_code}" "$BASE_URL/health")
    http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        print_test_result "Health Check" "PASS" "Server responding with 200"
    else
        print_test_result "Health Check" "FAIL" "Expected 200, got $http_code"
    fi
}

# Test 2: API Base Endpoint
test_api_base() {
    echo -e "${BLUE}🧪 Testing API Base Endpoint...${NC}"
    
    response=$(curl -s -w "%{http_code}" "$API_URL/")
    http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        print_test_result "API Base" "PASS" "API responding with 200"
    else
        print_test_result "API Base" "FAIL" "Expected 200, got $http_code"
    fi
}

# Test 3: Static File Serving
test_static_files() {
    echo -e "${BLUE}🧪 Testing Static File Serving...${NC}"
    
    # Test registration page
    response=$(curl -s -w "%{http_code}" "$BASE_URL/register")
    http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        print_test_result "Static Files - Register" "PASS" "Registration page accessible"
    else
        print_test_result "Static Files - Register" "FAIL" "Expected 200, got $http_code"
    fi
    
    # Test hasil page
    response=$(curl -s -w "%{http_code}" "$BASE_URL/hasil")
    http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        print_test_result "Static Files - Hasil" "PASS" "Status check page accessible"
    else
        print_test_result "Static Files - Hasil" "FAIL" "Expected 200, got $http_code"
    fi
}

# Test 4: File Upload Validation
test_file_upload_validation() {
    echo -e "${BLUE}🧪 Testing File Upload Validation...${NC}"
    
    # Create temporary test files
    echo "test content" > test_photo.jpg
    echo "test content" > test_cert.pdf
    
    # Test registration with missing required fields
    response=$(curl -s -w "%{http_code}" -X POST "$API_URL/register" \
        -F "nama_lengkap=Test User" \
        -F "foto=@test_photo.jpg")
    
    http_code="${response: -3}"
    
    if [ "$http_code" = "400" ]; then
        print_test_result "File Upload Validation" "PASS" "Proper validation error for incomplete data"
    else
        print_test_result "File Upload Validation" "FAIL" "Expected 400, got $http_code"
    fi
    
    # Cleanup
    rm -f test_photo.jpg test_cert.pdf
}

# Test 5: Invalid Ticket Check
test_invalid_ticket() {
    echo -e "${BLUE}🧪 Testing Invalid Ticket Handling...${NC}"
    
    response=$(curl -s -w "%{http_code}" "$API_URL/check/INVALID-TICKET")
    http_code="${response: -3}"
    
    if [ "$http_code" = "400" ] || [ "$http_code" = "404" ]; then
        print_test_result "Invalid Ticket" "PASS" "Proper error for invalid ticket format"
    else
        print_test_result "Invalid Ticket" "FAIL" "Expected 400/404, got $http_code"
    fi
}

# Test 6: Database Connection (via health endpoint)
test_database_connection() {
    echo -e "${BLUE}🧪 Testing Database Connection...${NC}"
    
    health_response=$(curl -s "$BASE_URL/health")
    
    if echo "$health_response" | grep -q '"database":.*"status":"healthy"'; then
        print_test_result "Database Connection" "PASS" "Database health check passed"
    else
        print_test_result "Database Connection" "FAIL" "Database health check failed"
    fi
}

# Test 7: Directory Structure
test_directory_structure() {
    echo -e "${BLUE}🧪 Testing Directory Structure...${NC}"
    
    required_dirs=("uploads/photos" "uploads/certificates" "uploads/qr-codes" "backups" "logs")
    all_dirs_exist=true
    
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            all_dirs_exist=false
            break
        fi
    done
    
    if $all_dirs_exist; then
        print_test_result "Directory Structure" "PASS" "All required directories exist"
    else
        print_test_result "Directory Structure" "FAIL" "Some required directories are missing"
    fi
}

# Test 8: Environment Variables
test_environment_variables() {
    echo -e "${BLUE}🧪 Testing Environment Variables...${NC}"
    
    if [ -f ".env" ]; then
        print_test_result "Environment File" "PASS" ".env file exists"
        
        # Check for critical variables
        required_vars=("MYSQL_HOST" "MYSQL_DATABASE" "PORT")
        missing_vars=""
        
        for var in "${required_vars[@]}"; do
            if ! grep -q "^$var=" .env; then
                missing_vars="$missing_vars $var"
            fi
        done
        
        if [ -z "$missing_vars" ]; then
            print_test_result "Environment Variables" "PASS" "All critical variables present"
        else
            print_test_result "Environment Variables" "FAIL" "Missing variables:$missing_vars"
        fi
    else
        print_test_result "Environment File" "FAIL" ".env file not found"
    fi
}

# Test 9: Security Headers (if production)
test_security_headers() {
    echo -e "${BLUE}🧪 Testing Security Headers...${NC}"
    
    headers=$(curl -s -I "$BASE_URL/")
    
    if echo "$headers" | grep -qi "x-content-type-options"; then
        print_test_result "Security Headers" "PASS" "Security headers present"
    else
        print_test_result "Security Headers" "FAIL" "Security headers missing"
    fi
}

# Test 10: API Error Handling
test_api_error_handling() {
    echo -e "${BLUE}🧪 Testing API Error Handling...${NC}"
    
    # Test non-existent endpoint
    response=$(curl -s -w "%{http_code}" "$API_URL/nonexistent")
    http_code="${response: -3}"
    
    if [ "$http_code" = "404" ]; then
        print_test_result "API Error Handling" "PASS" "Proper 404 for non-existent endpoint"
    else
        print_test_result "API Error Handling" "FAIL" "Expected 404, got $http_code"
    fi
}

# Main test execution
main() {
    echo -e "${YELLOW}📋 OSIS Recruitment System - Test Suite${NC}"
    echo "Starting tests at: $(date)"
    echo "Base URL: $BASE_URL"
    echo "Results will be logged to: $TEST_RESULTS_FILE"
    echo ""
    
    # Wait for server to be ready
    if ! wait_for_server; then
        echo -e "${RED}❌ Server not accessible. Please start the application first.${NC}"
        echo "Run: npm start"
        exit 1
    fi
    
    echo ""
    echo -e "${YELLOW}🧪 Running Test Suite...${NC}"
    echo "========================"
    
    # Run all tests
    test_health_check
    test_api_base
    test_static_files
    test_file_upload_validation
    test_invalid_ticket
    test_database_connection
    test_directory_structure
    test_environment_variables
    test_security_headers
    test_api_error_handling
    
    echo ""
    echo "========================"
    echo -e "${YELLOW}📊 Test Results Summary${NC}"
    echo "========================"
    echo -e "${GREEN}✅ Passed: $passed_tests${NC}"
    echo -e "${RED}❌ Failed: $failed_tests${NC}"
    echo "📄 Full results: $TEST_RESULTS_FILE"
    
    total_tests=$((passed_tests + failed_tests))
    if [ $total_tests -gt 0 ]; then
        success_rate=$((passed_tests * 100 / total_tests))
        echo "📈 Success Rate: $success_rate%"
    fi
    
    echo ""
    if [ $failed_tests -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed! System is ready for use.${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  Some tests failed. Please review the issues above.${NC}"
        exit 1
    fi
}

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo -e "${RED}❌ curl is required but not installed. Please install curl first.${NC}"
    exit 1
fi

# Run main function
main "$@"
