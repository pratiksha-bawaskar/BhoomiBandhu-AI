from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# BhoomiBandhu System Message
BHOOMI_BANDHU_SYSTEM_MESSAGE = """You are BhoomiBandhu, a warm, respectful, and knowledgeable AI assistant designed to support farmers, landowners, and rural communities in India. Your goal is to provide clear, practical, and culturally relevant advice on agriculture, land records, government schemes, and sustainable practices.

You speak in simple English or Hindi, depending on the user's preference. You avoid technical jargon unless asked, and always explain concepts in a way that is easy to understand. You prioritize empathy, clarity, and usefulness.

If a user asks about farming techniques, land registration, crop selection, weather, or government benefits, respond with step-by-step guidance. If you don't know something, say so politely and suggest where the user can find help.

Always be encouraging, patient, and supportive. Your tone should feel like a trusted local advisor who understands the challenges of rural life and wants to help.

Key areas you help with:
- Farming techniques and best practices
- Crop selection based on soil and climate
- Weather-related farming advice
- Land records and registration processes
- Government schemes like PM-Kisan, Soil Health Card, etc.
- Sustainable and organic farming practices
- Pest control and disease management
- Market prices and selling tips

When responding in Hindi, use simple Devanagari script that's easy to read. Always provide practical, actionable advice."""

# Define Models
class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    role: str  # "user" or "assistant"
    content: str
    language: str = "english"  # "english" or "hindi"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    session_id: str
    message: str
    language: str = "english"

class ChatResponse(BaseModel):
    response: str
    session_id: str
    message_id: str
    timestamp: datetime

class QuickTip(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    category: str
    language: str
    season: Optional[str] = None

class PresetQuestion(BaseModel):
    id: str
    question: str
    category: str
    language: str

# Quick Tips Data (can be stored in DB later)
QUICK_TIPS = [
    {
        "id": "1",
        "title": "Monsoon Farming Tips",
        "description": "Ensure proper drainage in fields. Plant rice, maize, and vegetables. Watch for waterlogging.",
        "category": "seasonal",
        "language": "english",
        "season": "monsoon"
    },
    {
        "id": "2",
        "title": "मानसून खेती सुझाव",
        "description": "खेतों में उचित जल निकासी सुनिश्चित करें। धान, मक्का और सब्जियां लगाएं। जलभराव से सावधान रहें।",
        "category": "seasonal",
        "language": "hindi",
        "season": "monsoon"
    },
    {
        "id": "3",
        "title": "Soil Testing Benefits",
        "description": "Test soil every 2-3 years. Get Soil Health Card for free. Know exact fertilizer needs.",
        "category": "soil",
        "language": "english"
    },
    {
        "id": "4",
        "title": "PM-Kisan Yojana",
        "description": "Get ₹6000 per year in 3 installments. Register at pmkisan.gov.in or nearest CSC.",
        "category": "schemes",
        "language": "english"
    }
]

# Preset Questions Data
PRESET_QUESTIONS = [
    {"id": "1", "question": "What is the best crop for clay soil?", "category": "crops", "language": "english"},
    {"id": "2", "question": "How do I apply for PM-Kisan scheme?", "category": "schemes", "language": "english"},
    {"id": "3", "question": "What are organic farming methods?", "category": "farming", "language": "english"},
    {"id": "4", "question": "How to check my land records online?", "category": "land", "language": "english"},
    {"id": "5", "question": "मिट्टी परीक्षण कैसे करें?", "category": "soil", "language": "hindi"},
    {"id": "6", "question": "पीएम-किसान योजना के लिए कैसे आवेदन करें?", "category": "schemes", "language": "hindi"},
]

# Routes
@api_router.get("/")
async def root():
    return {"message": "BhoomiBandhu API is running", "version": "1.0"}

@api_router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Main chat endpoint for BhoomiBandhu"""
    try:
        # Get Emergent LLM Key
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="LLM API key not configured")
        
        # Add language context to system message
        language_instruction = ""
        if request.language.lower() == "hindi":
            language_instruction = "\n\nIMPORTANT: The user prefers Hindi. Please respond primarily in Hindi (Devanagari script) with simple, clear language. You may include English terms for technical words if needed."
        
        system_message = BHOOMI_BANDHU_SYSTEM_MESSAGE + language_instruction
        
        # Initialize LLM Chat
        chat = LlmChat(
            api_key=api_key,
            session_id=request.session_id,
            system_message=system_message
        ).with_model("openai", "gpt-4o-mini")
        
        # Create user message
        user_message = UserMessage(text=request.message)
        
        # Get response from LLM
        ai_response = await chat.send_message(user_message)
        
        # Store user message in database
        user_msg = ChatMessage(
            session_id=request.session_id,
            role="user",
            content=request.message,
            language=request.language
        )
        user_doc = user_msg.model_dump()
        user_doc['timestamp'] = user_doc['timestamp'].isoformat()
        await db.chat_messages.insert_one(user_doc)
        
        # Store assistant message in database
        assistant_msg = ChatMessage(
            session_id=request.session_id,
            role="assistant",
            content=ai_response,
            language=request.language
        )
        assistant_doc = assistant_msg.model_dump()
        assistant_doc['timestamp'] = assistant_doc['timestamp'].isoformat()
        await db.chat_messages.insert_one(assistant_doc)
        
        return ChatResponse(
            response=ai_response,
            session_id=request.session_id,
            message_id=assistant_msg.id,
            timestamp=assistant_msg.timestamp
        )
        
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")

@api_router.get("/chat/history/{session_id}", response_model=List[ChatMessage])
async def get_chat_history(session_id: str):
    """Get chat history for a session"""
    try:
        messages = await db.chat_messages.find(
            {"session_id": session_id},
            {"_id": 0}
        ).sort("timestamp", 1).to_list(1000)
        
        # Convert ISO string timestamps back to datetime objects
        for msg in messages:
            if isinstance(msg['timestamp'], str):
                msg['timestamp'] = datetime.fromisoformat(msg['timestamp'])
        
        return messages
    except Exception as e:
        logger.error(f"Error fetching chat history: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching chat history")

@api_router.get("/quick-tips", response_model=List[QuickTip])
async def get_quick_tips(language: Optional[str] = None):
    """Get quick farming tips"""
    tips = QUICK_TIPS
    if language:
        tips = [tip for tip in tips if tip["language"] == language.lower()]
    return tips

@api_router.get("/preset-questions", response_model=List[PresetQuestion])
async def get_preset_questions(language: Optional[str] = None):
    """Get preset questions"""
    questions = PRESET_QUESTIONS
    if language:
        questions = [q for q in questions if q["language"] == language.lower()]
    return questions

@api_router.delete("/chat/session/{session_id}")
async def delete_chat_session(session_id: str):
    """Delete a chat session"""
    try:
        result = await db.chat_messages.delete_many({"session_id": session_id})
        return {"message": f"Deleted {result.deleted_count} messages", "session_id": session_id}
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting session")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
