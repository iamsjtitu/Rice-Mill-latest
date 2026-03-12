#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================


#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Cash Book Cash In for sale voucher party (Gayatri Agro) not reflecting in Sale Voucher paid status and Party Ledger. Auto-ledger entry was creating Jama instead of Nikasi for Cash In entries."

backend:
  - task: "Auto-ledger creates correct Nikasi for Cash In entries"
    implemented: true
    working: true
    file: "backend/routes/cashbook.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
        - agent: "main"
        - comment: "Fixed auto-ledger in add_cash_transaction to always set txn_type='nikasi'. Previously it copied txn_type from cash entry, causing Cash In (jama) to create Ledger Jama instead of Nikasi."

  - task: "Party Summary uses ledger for sale/purchase voucher paid amounts"
    implemented: true
    working: true
    file: "backend/routes/private_trading.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
        - agent: "main"
        - comment: "Updated _get_party_summary to compute sale/purchase voucher paid amounts from cashbook ledger entries instead of voucher document's paid_amount field."

  - task: "Auto-ledger txn_type preserved on update"
    implemented: true
    working: true
    file: "backend/routes/cashbook.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: true
        - agent: "main"
        - comment: "Excluded txn_type from auto-ledger update propagation in update_cash_transaction to keep auto-ledger always as nikasi."

frontend:
  - task: "Sale Book shows correct ledger-based payment status"
    implemented: true
    working: true
    file: "frontend/src/components/SaleBook.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
        - agent: "main"
        - comment: "Frontend already uses ledger_paid and ledger_balance from backend. The fix was backend-only."

  - task: "Vouchers Party Summary shows correct received amounts"
    implemented: true
    working: true
    file: "frontend/src/components/PaddyPurchase.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: true
        - agent: "main"
        - comment: "Frontend shows backend-computed amounts. Fixed via backend API change."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 72
  run_ui: true

test_plan:
  current_focus:
    - "Auto-ledger creates correct Nikasi for Cash In entries"
    - "Sale Book shows correct ledger-based payment status"
    - "Vouchers Party Summary shows correct received amounts"
    - "Cash Book Party Summary shows correct balance"
    - "Existing flows not broken (DC delivery, mandi entries, truck payments)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
    - message: "Fixed 2 critical bugs: 1) Cash Book auto-ledger now creates Nikasi (not Jama) for Cash In entries - this ensures manual Cash Book payments appear in Sale Voucher paid status and party ledgers. 2) Vouchers Party Summary now computes paid amounts from ledger instead of voucher documents. Login: admin/admin123. Test by creating a Cash In for a sale voucher party and verifying it shows in Sale Voucher as paid."
