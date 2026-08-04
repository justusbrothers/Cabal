// ==========================================
// GLOBAL STATE DECLARATIONS
// ==========================================
window.parsedCustomers = {}; // Stores customer details and their list of books
window.currentSortColumn = 'name'; // Options: 'name', 'items', 'progress'
window.currentSortDirection = 'asc'; // Options: 'asc', 'desc'
window.currentInnerSortColumn = 'comic'; // Default sort column
window.currentInnerSortDirection = 'asc';  // Default sort direction

// ==========================================
// DATE & STRING UTILITY FUNCTIONS
// ==========================================

/**
 * Calculates the YYYY-MM-DD string for the upcoming Wednesday.
 * If today is Wednesday, it returns today's date.
 */
window.getUpcomingWednesdayString = function() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // Sunday = 0, Monday = 1, Tuesday = 2, Wednesday = 3...
  
  // Calculate how many days to add to get to Wednesday (3)
  let daysUntilWednesday = (3 - dayOfWeek + 7) % 7;
  
  const upcomingWednesday = new Date(today);
  upcomingWednesday.setDate(today.getDate() + daysUntilWednesday);
  
  // Format as YYYY-MM-DD
  const yyyy = upcomingWednesday.getFullYear();
  const mm = String(upcomingWednesday.getMonth() + 1).padStart(2, '0');
  const dd = String(upcomingWednesday.getDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Extracts a last name from a full name string for clean sorting.
 */
window.getLastName = function(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
};

/**
 * Returns dynamic bootstrap classes and styles based on unchecked items remaining.
 */
window.getBadgeColorAndText = function(remainingCount) {
  if (remainingCount === 0) {
    return { class: 'bg-success', text: '✓ Done' };
  }
  return { 
    class: 'bg-primary', 
    text: `${remainingCount} Left`,
    style: 'background-color: var(--bs-primary) !important;' 
  };
};

/**
 * Helper to normalize date strings (MM/DD/YYYY or similar) to YYYY-MM-DD.
 */
window.normalizeDate = function(dateStr) {
  if (!dateStr) return '';
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return '';
  
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
