"""
Authentication Router.
Defines signup and login routes for user profiles.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.database import get_supabase_client

router = APIRouter()

class SignupRequest(BaseModel):
    email: str
    name: str

class LoginRequest(BaseModel):
    email: str

class ProfileResponse(BaseModel):
    id: int
    email: str
    name: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@router.post("/signup", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest):
    """
    Create a new user profile.
    Inserts a row into the profiles table.
    """
    client = get_supabase_client()
    
    # Check if user already exists
    try:
        existing = client.table("profiles").select("*").eq("email", payload.email).execute()
        if existing.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A profile with this email already exists."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error checking existing profile: {str(e)}"
        )
        
    try:
        res = client.table("profiles").insert({
            "email": payload.email,
            "name": payload.name
        }).execute()
        
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create profile."
            )
        return res.data[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error creating profile: {str(e)}"
        )


@router.post("/login", response_model=ProfileResponse)
async def login(payload: LoginRequest):
    """
    Log in a user.
    Verifies if the email exists in profiles, returning the profile or 404.
    """
    client = get_supabase_client()
    
    try:
        res = client.table("profiles").select("*").eq("email", payload.email).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found."
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error during login: {str(e)}"
        )
