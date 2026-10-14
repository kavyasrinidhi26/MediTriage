"""
MediTriage AI — Modular Chief Complaint Text Processor
Processes multilingual presenting complaints in English, Telugu Script, and Telugu Transliteration.
Extracts clinically reviewed symptom concepts with contextual distinction:
- Positive (active finding)
- Negated (denied finding)
- Uncertain (suspected/ambiguous)
- Historical (past/resolved episode)

Preserves patient's original wording verbatim and flags low-confidence language for nurse review.
"""

import re
import unicodedata
from enum import Enum
from typing import List, Dict, Optional, Any, Set
from pydantic import BaseModel, Field

from app.nlp.symptom_dictionary import (
    SYMPTOM_DICTIONARY,
    NEGATIONS_ENGLISH,
    NEGATIONS_TELUGU_SCRIPT,
    NEGATIONS_TELUGU_TRANSLIT,
    UNCERTAINTY_ENGLISH,
    UNCERTAINTY_TELUGU,
    HISTORICAL_ENGLISH,
    HISTORICAL_TELUGU,
    SEVERITY_MODIFIERS,
    RED_FLAG_CONCEPTS,
)


class LanguageFormat(str, Enum):
    ENGLISH = "English"
    TELUGU_SCRIPT = "Telugu (Telugu Script)"
    TELUGU_TRANSLITERATION = "Telugu (Latin Transliteration)"
    MIXED_TELUGU_ENGLISH = "Mixed (Telugu & English)"
    AMBIGUOUS_OR_UNSUPPORTED = "Ambiguous / Unsupported"


class SymptomContext(str, Enum):
    POSITIVE = "POSITIVE"          # Actively reported present
    NEGATED = "NEGATED"            # Explicitly denied ("no chest pain", "gunde noppi ledu")
    UNCERTAIN = "UNCERTAIN"        # Unconfirmed / suspected ("maybe had seizure")
    HISTORICAL = "HISTORICAL"      # Past or resolved episode ("had fever last week")


class ExtractedSymptomConcept(BaseModel):
    concept: str = Field(..., description="Standardized clinical concept identifier")
    matched_term: str = Field(..., description="Actual token or phrase found in dictionary")
    supporting_phrase: Optional[str] = Field(None, description="Actual words or phrase found in patient text supporting extraction")
    context: SymptomContext = Field(..., description="Contextual polarity: POSITIVE, NEGATED, UNCERTAIN, or HISTORICAL")
    language_format: LanguageFormat
    is_red_flag: bool = False
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    severity_modifier: Optional[str] = Field(None, description="Clinical severity qualifier (e.g. 'severe', 'mild')")


class ProcessedComplaint(BaseModel):
    original_complaint: str = Field(..., description="Original complaint preserved verbatim without modification")
    normalized_text: str = Field(..., description="Whitespace and punctuation normalized text")
    detected_language: LanguageFormat
    extracted_symptoms: List[ExtractedSymptomConcept]
    positive_concepts: List[str] = Field(default_factory=list, description="Concepts confirmed as actively positive")
    negated_concepts: List[str] = Field(default_factory=list, description="Concepts explicitly denied or absent")
    uncertain_concepts: List[str] = Field(default_factory=list, description="Concepts with clinical uncertainty")
    historical_concepts: List[str] = Field(default_factory=list, description="Concepts from past/resolved history")
    red_flag_triggers: List[str] = Field(default_factory=list, description="Red flag triggers derived ONLY from positive concepts")
    requires_nurse_review: bool = False
    review_reason: Optional[str] = None
    is_unsupported_or_ambiguous: bool = False
    is_contradictory: bool = False
    clinical_disclaimer: str = (
        "CLINICAL SAFETY NOTICE: Extracted symptom concepts are assistive triage indicators "
        "and do NOT constitute a diagnosis. Staff review is mandatory."
    )


def normalize_complaint_text(text: str) -> str:
    """
    Normalizes whitespace and standardizes punctuation without removing words or meaningful negations.
    """
    if not text:
        return ""
    # Unicode normalize
    norm = unicodedata.normalize("NFKC", text)
    # Replace multiple whitespaces and newlines with a single space
    norm = re.sub(r"\s+", " ", norm).strip()
    return norm


def detect_complaint_language(text: str) -> LanguageFormat:
    """
    Detects language format based on Unicode ranges and vocabulary markers.
    Language detection is explicitly kept separate from translation.
    Supports English, Telugu Script, Telugu Latin Transliteration, and Mixed (Telugu & English).
    """
    if not text or not text.strip():
        return LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED

    clean = text.strip()

    # 1. Check for Telugu Unicode script (0x0C00 - 0x0C7F)
    has_telugu_script = any("\u0C00" <= char <= "\u0C7F" for char in clean)
    words_latin = re.findall(r"\b[a-zA-Z]+\b", clean.lower())

    if has_telugu_script:
        # Check if it also has distinct English / Latin words (Mixed Telugu script + English)
        if len(words_latin) >= 1:
            return LanguageFormat.MIXED_TELUGU_ENGLISH
        return LanguageFormat.TELUGU_SCRIPT

    # 2. Check Latin script text
    if not words_latin:
        # Symbols only, numbers, or unclassified scripts
        return LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED

    telugu_translit_markers = {
        "naaku", "naku", "chaathilo", "chathilo", "chaathi", "chathi", "chaati", "chati", "chhati", "chhatilo",
        "gunde", "gundelo", "gundello", "noppi", "noppiga", "noppulu", "noppuluga",
        "aayasam", "ayasam", "aayasanga", "swasa", "dammu", "gaali", "oopiri",
        "jwaram", "jvaram", "chali", "ollu", "kaaladam", "kaladam",
        "talanoppi", "thala", "thalapotu", "vantulu", "vaantulu", "virechanalu", "motionulu",
        "raktam", "raktham", "kadupu", "kadupulo", "potta", "kallu", "thirigi", "tirigi",
        "undu", "undi", "undhi", "vachindi", "vasthondi", "ledu", "ledhu", "lekapovadam",
        "mariyu", "kani", "kaani", "murcha", "nadumu", "mokaalla", "keella",
        "durada", "kanti", "chevi", "gonthu", "garbhavathi", "nelalu", "pakshavatham", "cheyyi", "kaalu"
    }

    english_markers = {
        "i", "have", "severe", "chest", "pain", "pains", "fever", "and", "body", "cough",
        "breathless", "breathlessness", "shortness", "breath", "breathing", "headache",
        "vomiting", "diarrhea", "for", "days", "hours", "mild", "acute", "with", "rash",
        "itching", "weakness", "unwell", "cold", "stomach", "leg", "arm", "eye", "ear",
        "throat", "denies", "no", "not", "dont", "had", "history", "blood", "patient",
        "feels", "feeling", "burning", "difficulty", "trouble", "bleeding", "drowsy", "fits",
        "fatigue", "tired", "weak", "vague", "routine", "checkup", "consultation", "followup",
        "follow", "up", "general", "since", "yesterday", "morning", "night", "week", "weeks",
        "month", "months", "swelling", "ache", "injury", "fall", "accident", "wound", "cut",
        "infection", "dizzy", "dizziness", "nausea", "loss", "appetite", "weight", "back",
        "joint", "joints", "knee", "shoulder", "neck", "head", "face", "droop", "slurred",
        "speech", "vision", "blur", "blurred", "pressure", "cramp", "cramps", "tightness",
        "discomfort", "heaviness", "discharge", "urination", "urine", "stool", "allergy",
        "allergic", "swollen", "palpitations", "syncope", "fainted", "fainting", "seizure",
        "sugar", "bp", "diabetes", "hypertension", "asthma"
    }

    has_te_marker = any(w in telugu_translit_markers for w in words_latin)
    has_en_marker = any(w in english_markers for w in words_latin)

    # Mixed Language (Telugu transliteration + English vocabulary)
    if has_te_marker and has_en_marker:
        return LanguageFormat.MIXED_TELUGU_ENGLISH

    if has_te_marker:
        return LanguageFormat.TELUGU_TRANSLITERATION

    if has_en_marker:
        return LanguageFormat.ENGLISH

    # English ASCII text fallback if majority of words look like valid ASCII words
    # But if there are no known medical or conversational markers, treat as ambiguous
    return LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED


def _find_phrase_in_text(text: str, phrase: str) -> Optional[tuple[int, int]]:
    """
    Finds starting and ending character index of a phrase in text with appropriate boundary checking.
    Uses word boundaries for Latin text to prevent false substring collisions (e.g. 'ear' in 'forearm').
    """
    t_lower = text.lower()
    p_lower = phrase.lower()

    # If phrase is purely Latin/alphanumeric, enforce word boundaries
    if re.match(r"^[a-zA-Z0-9\s]+$", p_lower):
        pattern = rf"\b{re.escape(p_lower)}\b"
        match = re.search(pattern, t_lower)
        if match:
            return match.start(), match.end()
        return None
    else:
        # Non-Latin script (e.g. Telugu script)
        idx = t_lower.find(p_lower)
        if idx != -1:
            return idx, idx + len(p_lower)
        return None


def _extract_severity(clause: str) -> Optional[str]:
    """Extracts clinical severity qualifier (severe, moderate, mild) from a clause."""
    c_lower = clause.lower()
    for level, keywords in SEVERITY_MODIFIERS.items():
        for kw in keywords:
            pattern = rf"(^|\s){re.escape(kw.lower())}(\s|$)"
            if re.search(pattern, c_lower):
                return level
    return None


def _detect_context(
    text: str,
    start_idx: int,
    end_idx: int,
    lang: LanguageFormat
) -> tuple[SymptomContext, str, Optional[str]]:
    """
    Determines whether a matched symptom is POSITIVE, NEGATED, UNCERTAIN, or HISTORICAL.
    Inspects surrounding window of tokens restricted to the current clause.
    Returns:
    - SymptomContext enum
    - Supporting phrase in text
    - Severity modifier (if any)
    """
    lower_text = text.lower()
    
    # 1. Isolate the clause for pre-context and post-context
    # Clause delimiters: punctuation and coordinating conjunctions
    delimiters = [",", ";", ".", "!", "?", " but ", " however ", " while ", " and ", " కానీ ", " అయితే "]

    # Find clause start (nearest delimiter before start_idx)
    clause_start = max(0, start_idx - 60)
    for delim in delimiters:
        pos = lower_text.rfind(delim, max(0, start_idx - 60), start_idx)
        if pos != -1 and pos + len(delim) > clause_start:
            clause_start = pos + len(delim)

    # Find clause end (nearest delimiter after end_idx)
    clause_end = min(len(lower_text), end_idx + 60)
    for delim in delimiters:
        pos = lower_text.find(delim, end_idx, min(len(lower_text), end_idx + 60))
        if pos != -1 and pos < clause_end:
            clause_end = pos

    pre_clause = lower_text[clause_start:start_idx]
    post_clause = lower_text[end_idx:clause_end]
    full_clause = text[clause_start:clause_end].strip()
    matched_text = text[start_idx:end_idx]
    severity = _extract_severity(matched_text + " " + pre_clause + " " + post_clause)

    # 1. Historical check within clause
    hist_terms = HISTORICAL_ENGLISH if lang == LanguageFormat.ENGLISH else HISTORICAL_TELUGU + HISTORICAL_ENGLISH
    for ht in hist_terms:
        if ht in pre_clause or ht in post_clause:
            return SymptomContext.HISTORICAL, full_clause or matched_text, severity

    # 2. Uncertainty check within clause
    unc_terms = UNCERTAINTY_ENGLISH if lang == LanguageFormat.ENGLISH else UNCERTAINTY_TELUGU + UNCERTAINTY_ENGLISH
    for ut in unc_terms:
        if ut in pre_clause or ut in post_clause:
            return SymptomContext.UNCERTAIN, full_clause or matched_text, severity

    # 3. Negation check
    # English negations typically precede symptom: "no chest pain", "don't have fever", "denies fever"
    for neg in NEGATIONS_ENGLISH:
        pattern = rf"(^|\s){re.escape(neg)}(\s|$)"
        if re.search(pattern, pre_clause):
            # Extract negation phrase as supporting phrase
            neg_idx = pre_clause.rfind(neg)
            supp = text[clause_start + neg_idx:end_idx].strip() if neg_idx != -1 else f"{neg} {matched_text}"
            return SymptomContext.NEGATED, supp, severity

    # Telugu script negations typically follow symptom: "గుండె నొప్పి లేదు"
    for neg in NEGATIONS_TELUGU_SCRIPT:
        if neg in post_clause or neg in pre_clause:
            supp = full_clause if full_clause else f"{matched_text} {neg}"
            return SymptomContext.NEGATED, supp, severity

    # Telugu transliteration negations typically follow symptom: "gunde noppi ledu"
    for neg in NEGATIONS_TELUGU_TRANSLIT:
        pattern = rf"(^|\s){re.escape(neg)}(\s|$)"
        if re.search(pattern, post_clause) or re.search(pattern, pre_clause):
            supp = full_clause if full_clause else f"{matched_text} {neg}"
            return SymptomContext.NEGATED, supp, severity

    # Build supporting phrase with severity if present
    supporting = matched_text
    if severity and full_clause:
        supporting = full_clause
    elif full_clause and len(full_clause) <= 40:
        supporting = full_clause

    return SymptomContext.POSITIVE, supporting, severity


def process_complaint(text: str) -> ProcessedComplaint:
    """
    Main entrypoint for processing a chief complaint:
    1. Preserves original complaint verbatim.
    2. Normalizes text without losing negation keywords.
    3. Detects language format (English, Telugu Script, Telugu Transliteration, Mixed).
    4. Extracts clinically reviewed symptom concepts.
    5. Categorizes context (POSITIVE, NEGATED, UNCERTAIN, HISTORICAL).
    6. Identifies red-flag triggers strictly from positive concepts.
    7. Flags ambiguous, contradictory, or unsupported language for nurse review.
    8. Resilient top-level exception handling returning safe nurse review.
    """
    try:
        if not text or not text.strip():
            return ProcessedComplaint(
                original_complaint=text or "",
                normalized_text="",
                detected_language=LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED,
                extracted_symptoms=[],
                requires_nurse_review=True,
                is_unsupported_or_ambiguous=True,
                review_reason="Empty or missing chief complaint; Cannot assess safely — send to nurse now.",
            )

        original = text
        normalized = normalize_complaint_text(original)
        language = detect_complaint_language(normalized)

        extracted_symptoms: List[ExtractedSymptomConcept] = []

        # Search for known symptom concepts
        for concept, lang_dict in SYMPTOM_DICTIONARY.items():
            # Check relevant terms for detected language and fallback to all languages
            terms_to_check: List[str] = []
            if language == LanguageFormat.TELUGU_SCRIPT:
                terms_to_check = lang_dict.get("te_script", []) + lang_dict.get("en", [])
            elif language == LanguageFormat.TELUGU_TRANSLITERATION:
                terms_to_check = lang_dict.get("te_translit", []) + lang_dict.get("en", [])
            elif language == LanguageFormat.MIXED_TELUGU_ENGLISH:
                terms_to_check = lang_dict.get("te_translit", []) + lang_dict.get("en", []) + lang_dict.get("te_script", [])
            else:
                terms_to_check = lang_dict.get("en", []) + lang_dict.get("te_translit", []) + lang_dict.get("te_script", [])

            # Find all non-overlapping matches for this concept across clauses
            curr_pos = 0
            while curr_pos < len(normalized):
                best_span = None
                best_term = None
                for term in sorted(terms_to_check, key=len, reverse=True):
                    sub_text = normalized[curr_pos:]
                    span = _find_phrase_in_text(sub_text, term)
                    if span:
                        actual_span = (curr_pos + span[0], curr_pos + span[1])
                        if best_span is None or actual_span[0] < best_span[0]:
                            best_span = actual_span
                            best_term = term
                            break
                if best_span and best_term:
                    start_i, end_i = best_span
                    context, supporting_phrase, severity = _detect_context(normalized, start_i, end_i, language)
                    is_rf = concept in RED_FLAG_CONCEPTS

                    extracted_symptoms.append(
                        ExtractedSymptomConcept(
                            concept=concept,
                            matched_term=best_term,
                            supporting_phrase=supporting_phrase,
                            context=context,
                            language_format=language,
                            is_red_flag=is_rf,
                            confidence=0.95 if context == SymptomContext.POSITIVE else 0.85,
                            severity_modifier=severity,
                        )
                    )
                    curr_pos = end_i
                else:
                    break

        # Separate by context (deduplicate while preserving order)
        positive = list(dict.fromkeys([s.concept for s in extracted_symptoms if s.context == SymptomContext.POSITIVE]))
        negated = list(dict.fromkeys([s.concept for s in extracted_symptoms if s.context == SymptomContext.NEGATED]))
        uncertain = list(dict.fromkeys([s.concept for s in extracted_symptoms if s.context == SymptomContext.UNCERTAIN]))
        historical = list(dict.fromkeys([s.concept for s in extracted_symptoms if s.context == SymptomContext.HISTORICAL]))

        # Red flag triggers ONLY from positive symptoms!
        # (A negated chest pain or historical fever must NEVER trigger an acute red flag)
        red_flag_triggers = list(dict.fromkeys([
            s.concept for s in extracted_symptoms
            if s.is_red_flag and s.context == SymptomContext.POSITIVE
        ]))

        # Nurse review evaluation:
        # 1. Contradictions: same concept reported as both POSITIVE and NEGATED
        contradictions = set(positive).intersection(set(negated))
        requires_review = False
        review_reason = None
        is_unsupported = False
        is_contradictory = False

        if not original or not original.strip():
            requires_review = True
            is_unsupported = True
            review_reason = "Empty presenting complaint; Cannot assess safely — send to nurse now."
        elif contradictions:
            requires_review = True
            is_contradictory = True
            review_reason = f"Contradictory clinical statements detected for symptom ({', '.join(contradictions)}); Cannot assess safely — send to nurse now."
        elif language == LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED:
            requires_review = True
            is_unsupported = True
            review_reason = "Unsupported language format, dialect, or ambiguous complaint text; Cannot assess safely — send to nurse now."
        elif language in (LanguageFormat.TELUGU_SCRIPT, LanguageFormat.TELUGU_TRANSLITERATION, LanguageFormat.MIXED_TELUGU_ENGLISH) and len(extracted_symptoms) == 0:
            requires_review = True
            is_unsupported = True
            review_reason = "Unrecognized Telugu dialect phrasing without verified clinical symptom mappings; Cannot assess safely — send to nurse now."
        elif len(uncertain) > 0:
            requires_review = True
            review_reason = f"Clinical uncertainty detected for symptoms ({', '.join(uncertain)}); Cannot assess safely — send to nurse now."

        return ProcessedComplaint(
            original_complaint=original,
            normalized_text=normalized,
            detected_language=language,
            extracted_symptoms=extracted_symptoms,
            positive_concepts=positive,
            negated_concepts=negated,
            uncertain_concepts=uncertain,
            historical_concepts=historical,
            red_flag_triggers=red_flag_triggers,
            requires_nurse_review=requires_review,
            review_reason=review_reason,
            is_unsupported_or_ambiguous=is_unsupported,
            is_contradictory=is_contradictory,
        )

    except Exception as exc:
        # Failsafe: Any unexpected NLP failure leads directly to safe nurse review
        return ProcessedComplaint(
            original_complaint=text or "",
            normalized_text=normalize_complaint_text(text or ""),
            detected_language=LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED,
            extracted_symptoms=[],
            requires_nurse_review=True,
            is_unsupported_or_ambiguous=True,
            review_reason=f"Language processing service failure ({type(exc).__name__}); Cannot assess safely — send to nurse now.",
        )


def check_red_flags_from_symptoms(extracted_symptoms: List[ExtractedSymptomConcept]) -> List[str]:
    """
    Independently testable safety-critical red flag checker.
    Returns list of triggered red flag concepts strictly from POSITIVE symptoms.
    Negated, uncertain, or historical symptoms are explicitly excluded.
    """
    return [
        s.concept for s in extracted_symptoms
        if s.is_red_flag and s.context == SymptomContext.POSITIVE
    ]
