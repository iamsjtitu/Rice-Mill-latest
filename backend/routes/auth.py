"""
Authentication routes
"""
from fastapi import APIRouter, HTTPException
from models.schemas import LoginRequest, LoginResponse, PasswordChangeRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Default credentials
USERS = {
    "admin": {"password": "admin123", "role": "admin"},
    "staff": {"password": "staff123", "role": "staff"}
}


def get_db():
    """Get database instance - will be set by main server"""
    from server import db
    return db


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    username = request.username
    password = request.password
    
    db = get_db()
    
    # Check from database first (for changed passwords)
    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    
    if user_doc:
        if user_doc.get("password") == password:
            return LoginResponse(
                success=True,
                username=username,
                role=user_doc.get("role", "staff"),
                message="Login successful"
            )
        else:
            raise HTTPException(status_code=401, detail="Galat password")
    
    # Fall back to default credentials
    if username in USERS:
        if USERS[username]["password"] == password:
            return LoginResponse(
                success=True,
                username=username,
                role=USERS[username]["role"],
                message="Login successful"
            )
        else:
            raise HTTPException(status_code=401, detail="Galat password")
    
    raise HTTPException(status_code=401, detail="User nahi mila")


@router.post("/change-password")
async def change_password(request: PasswordChangeRequest):
    username = request.username
    current_password = request.current_password
    new_password = request.new_password
    
    db = get_db()
    
    # Check current password
    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    
    if user_doc:
        if user_doc.get("password") != current_password:
            raise HTTPException(status_code=401, detail="Current password galat hai")
    else:
        # Check default credentials
        if username not in USERS or USERS[username]["password"] != current_password:
            raise HTTPException(status_code=401, detail="Current password galat hai")
    
    # Get role
    role = "staff"
    if user_doc:
        role = user_doc.get("role", "staff")
    elif username in USERS:
        role = USERS[username]["role"]
    
    # Update or insert password in database
    await db.users.update_one(
        {"username": username},
        {"$set": {"username": username, "password": new_password, "role": role}},
        upsert=True
    )
    
    return {"success": True, "message": "Password change ho gaya"}


@router.get("/verify")
async def verify_auth(username: str, password: str):
    """Verify user credentials"""
    db = get_db()
    
    user_doc = await db.users.find_one({"username": username}, {"_id": 0})
    
    if user_doc and user_doc.get("password") == password:
        return {"valid": True, "role": user_doc.get("role", "staff")}
    
    if username in USERS and USERS[username]["password"] == password:
        return {"valid": True, "role": USERS[username]["role"]}
    
    return {"valid": False}
