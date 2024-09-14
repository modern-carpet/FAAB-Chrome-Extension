console.log('Popup script loaded');

let isAuthorized = false;
let currentLeagueIndex = 0;
let leagues = [];

function switchLeague(direction) {
    currentLeagueIndex += direction;
    if (currentLeagueIndex < 0) currentLeagueIndex = leagues.length - 1;
    if (currentLeagueIndex >= leagues.length) currentLeagueIndex = 0;
    displayLeagueOverview();
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM fully loaded');

    const authButton = document.getElementById('authButton');
    const leagueOverview = document.getElementById('leagueOverview');
    const teamAnalysis = document.getElementById('teamAnalysis');
    const bidRecommendation = document.getElementById('bidRecommendation');
    const refreshDataButton = document.getElementById('refreshData');

    // Add event listeners for league switching buttons
    document.getElementById('prevLeague').addEventListener('click', () => switchLeague(-1));
    document.getElementById('nextLeague').addEventListener('click', () => switchLeague(1));

    // Initially hide all sections except the auth button
    leagueOverview.style.display = 'none';
    teamAnalysis.style.display = 'none';
    bidRecommendation.style.display = 'none';
    refreshDataButton.style.display = 'none';

    try {
        // Check if already authorized
        const result = await getStorageData('yahoo_token');
        if (result.yahoo_token) {
            isAuthorized = true;
            showAuthorizedContent();
        }

        // Set up event listener for authorization button
        if (authButton) {
            console.log('Auth button found');
            authButton.addEventListener('click', initiateAuth);
        } else {
            console.log('Auth button not found');
        }

        // Set up event listener for bid recommendation form
        const bidForm = document.getElementById('bidForm');
        if (bidForm) {
            console.log('Bid form found');
            bidForm.addEventListener('submit', handleBidRecommendation);
        } else {
            console.log('Bid form not found');
        }

        // Set up event listener for team selection
        const teamSelector = document.getElementById('teamSelector');
        if (teamSelector) {
            console.log('Team selector found');
            teamSelector.addEventListener('change', handleTeamSelection);
        } else {
            console.log('Team selector not found');
        }

        // Refresh data button functionality
        if (refreshDataButton) {
            console.log('Refresh data button found');
            refreshDataButton.addEventListener('click', refreshData);
        } else {
            console.log('Refresh data button not found');
        }

        // Update last updated timestamp
        updateLastUpdated();
    } catch (error) {
        console.error(`Error in DOMContentLoaded event listener: ${error.message}`);
    }
});

function showAuthorizedContent() {
    const authButton = document.getElementById('authButton');
    if (isAuthorized) {
        if (authButton) authButton.style.display = 'none';
        document.getElementById('leagueOverview').style.display = 'block';
        document.getElementById('teamAnalysis').style.display = 'block';
        document.getElementById('bidRecommendation').style.display = 'block';
        document.getElementById('refreshData').style.display = 'block';
        displayLeagueOverview();
    } else {
        if (authButton) authButton.style.display = 'block';
        document.getElementById('leagueOverview').style.display = 'none';
        document.getElementById('teamAnalysis').style.display = 'none';
        document.getElementById('bidRecommendation').style.display = 'none';
        document.getElementById('refreshData').style.display = 'none';
    }
}

async function initiateAuth() {
    console.log('Initiating authorization');
    showLoading(true);

    try {
        const response = await sendMessageToBackground({action: 'triggerOAuth'});
        if (response.success) {
            console.log('Authorization successful');
            isAuthorized = true;
            showAuthorizedContent();
            await refreshData(); // Fetch data after successful authorization
        } else {
            console.error('Authorization failed:', response.error);
            alert('Authorization failed. Please try again.');
        }
    } catch (error) {
        console.error('Error during authorization:', error);
        alert('An error occurred during authorization. Please try again.');
    } finally {
        showLoading(false);
    }
}
async function clearAuthState() {
    isAuthorized = false;
    await chrome.storage.local.remove('yahoo_token');
    showAuthorizedContent();
}

async function displayLeagueOverview() {
    console.log('Displaying league overview');
    const overviewElement = document.getElementById('leagueData');
    const teamSelector = document.getElementById('teamSelector');
    if (!overviewElement || !teamSelector) {
        console.log('League data element or team selector not found');
        return;
    }

    showLoading(true);

    try {
        const data = await getStorageData('leagueData');
        leagues = data.leagueData || [];
        if (leagues.length > 0 && leagues[currentLeagueIndex] && leagues[currentLeagueIndex].managers) {
            const currentLeague = leagues[currentLeagueIndex];
            console.log(`League data found: ${JSON.stringify(currentLeague)}`);
            let html = `<h3>${currentLeague.leagueName}</h3><ul>`;
            
            teamSelector.innerHTML = '<option value="">Select a team</option>'; // Clear existing options
            
            currentLeague.managers.forEach(manager => {
                html += `<li>${manager.name}: $${manager.faabRemaining} FAAB, Avg Bid: $${manager.avgBidSize}, Bids: ${manager.bidCount}</li>`;
                
                // Add option to team selector
                const option = document.createElement('option');
                option.value = manager.name;
                option.textContent = manager.name;
                teamSelector.appendChild(option);
            });

            html += '</ul>';
            overviewElement.innerHTML = html;
        } else {
            console.log('No league data available');
            overviewElement.innerHTML = '<p>No league data available. Please refresh data.</p>';
            // If we're authorized but have no data, the token might be invalid
            if (isAuthorized) {
                console.log('Authorized but no data, clearing auth state');
                await clearAuthState();
            }
        }
    } catch (error) {
        console.error(`Error in displayLeagueOverview: ${error.message}`);
        overviewElement.innerHTML = `<p>Error loading league data: ${error.message}</p>`;
        // If we get an error, the token might be invalid
        if (isAuthorized) {
            console.log('Error occurred while authorized, clearing auth state');
            await clearAuthState();
        }
    } finally {
        showLoading(false);
    }
}

function handleTeamSelection(event) {
    const selectedTeam = event.target.value;
    if (selectedTeam) {
        displayTeamAnalysis(selectedTeam);
    } else {
        document.getElementById('teamData').innerHTML = '';
    }
}

async function displayTeamAnalysis(teamName) {
    console.log(`Displaying team analysis for ${teamName}`);
    const teamDataElement = document.getElementById('teamData');
    if (!teamDataElement) {
        console.log('Team data element not found');
        return;
    }

    showLoading(true);

    try {
        const currentLeague = leagues[currentLeagueIndex];
        if (currentLeague && currentLeague.managers) {
            const team = currentLeague.managers.find(manager => manager.name === teamName);
            if (team) {
                teamDataElement.innerHTML = `
                    <h3>${team.name}</h3>
                    <p>FAAB Remaining: $${team.faabRemaining}</p>
                    <p>Average Bid Size: $${team.avgBidSize}</p>
                    <p>Total Bids: ${team.bidCount}</p>
                `;
            } else {
                teamDataElement.innerHTML = '<p>Team not found</p>';
            }
        } else {
            teamDataElement.innerHTML = '<p>No team data available</p>';
        }
    } catch (error) {
        console.error(`Error in displayTeamAnalysis: ${error.message}`);
        teamDataElement.innerHTML = `<p>Error loading team data: ${error.message}</p>`;
    } finally {
        showLoading(false);
    }
}

function handleBidRecommendation(event) {
    event.preventDefault();
    const playerNameInput = document.getElementById('playerName');
    const positionSelect = document.getElementById('position');
    const playerName = playerNameInput ? playerNameInput.value.trim() : '';
    const position = positionSelect ? positionSelect.value : '';
    
    if (!playerName || !position) {
        updateRecommendationDisplay('Please enter a player name and select a position.');
        return;
    }

    getBidRecommendation(playerName, position);
}

async function getBidRecommendation(playerName, position) {
    console.log(`Getting bid recommendation for ${playerName} (${position})`);
    showLoading(true);

    try {
        const currentLeague = leagues[currentLeagueIndex];
        if (currentLeague) {
            console.log('League data found for recommendation');
            const recommendedBid = calculateRecommendedBid(currentLeague, playerName, position);
            updateRecommendationDisplay(`Recommended bid for ${playerName} (${position}): $${recommendedBid}`);
        } else {
            console.log('No league data available for recommendation');
            updateRecommendationDisplay('Unable to provide recommendation. No league data available.');
        }
    } catch (error) {
        console.error(`Error in getBidRecommendation: ${error.message}`);
        updateRecommendationDisplay(`Error getting recommendation: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function calculateRecommendedBid(leagueData, playerName, position) {
    // TODO: Implement more sophisticated bid calculation logic
    const avgFaabRemaining = leagueData.managers.reduce((sum, manager) => sum + manager.faabRemaining, 0) / leagueData.managers.length;
    let positionMultiplier = 1;
    
    switch(position) {
        case 'QB':
        case 'RB':
        case 'WR':
            positionMultiplier = 1.2;
            break;
        case 'TE':
            positionMultiplier = 1.1;
            break;
        case 'K':
        case 'DEF':
            positionMultiplier = 0.8;
            break;
    }
    
    return Math.floor(avgFaabRemaining * 0.1 * positionMultiplier);
}

function updateRecommendationDisplay(message) {
    const recommendationElement = document.getElementById('recommendationResult');
    if (recommendationElement) {
        recommendationElement.textContent = message;
    } else {
        console.log('Recommendation element not found');
    }
}

async function refreshData() {
    console.log('Refreshing data');
    
    if (!isAuthorized) {
        console.log('Not authorized, showing auth button');
        showAuthorizedContent();
        return;
    }

    showLoading(true);

    try {
        const response = await sendMessageToBackground({action: 'fetchData'});
        if (response.success) {
            await displayLeagueOverview();
            updateLastUpdated();
        } else {
            throw new Error(response.error || 'Unknown error occurred while fetching data');
        }
    } catch (error) {
        console.error(`Error in refreshData: ${error.message}`);
        alert(`Data refresh error: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

function sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

function getStorageData(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, (data) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(data);
            }
        });
    });
}

function showLoading(show) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.classList.toggle('hidden', !show);
    } else {
        console.log('Loading indicator element not found');
    }
}

function updateLastUpdated() {
    const lastUpdatedElement = document.getElementById('lastUpdated');
    if (lastUpdatedElement) {
        lastUpdatedElement.textContent = new Date().toLocaleString();
    } else {
        console.log('Last updated element not found');
    }
}

window.addEventListener('error', function(event) {
    console.error(`Unhandled error: ${event.message} at ${event.filename}:${event.lineno}`);
});