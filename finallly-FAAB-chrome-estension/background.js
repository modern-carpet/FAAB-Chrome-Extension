console.log('Background script loaded');

const CLIENT_ID = 'dj0yJmk9TkVOQTVRc2hpc21nJmQ9WVdrOVJXRkNXbWR6UVdJbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTA3';
const REDIRECT_URI = 'https://enkoinkjidiailichongjnbladjoeelo.chromiumapp.org/';
const AUTHORIZATION_URL = 'https://api.login.yahoo.com/oauth2/request_auth';
const TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Fantasy Football FAAB Manager extension installed');
  chrome.alarms.create('refreshToken', { periodInMinutes: 50 });
  chrome.alarms.create('fetchData', { periodInMinutes: 5 });
});

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');
  fetchLeagueData();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshToken') {
    refreshAccessToken();
  } else if (alarm.name === 'fetchData') {
    fetchLeagueData();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);
  if (request.action === 'triggerOAuth') {
    authorize()
      .then(token => {
        console.log('Authorization successful');
        sendResponse({success: true, token: token});
      })
      .catch(error => {
        console.error('Authorization failed:', error);
        sendResponse({success: false, error: error.message});
      });
    return true;  // Indicates we will send a response asynchronously
  } else if (request.action === 'fetchData') {
    fetchLeagueData()
      .then(() => sendResponse({success: true}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true;
  }
});

async function getAccessToken() {
    console.log('Getting access token');
    try {
        const token = await chrome.storage.local.get('yahoo_token');
        if (token.yahoo_token && Date.now() < token.yahoo_token.expires_at) {
            console.log('Valid token found in storage');
            return token.yahoo_token.access_token;
        }
        console.log('No valid token found, refreshing');
        return await refreshAccessToken();
    } catch (error) {
        console.error('Error getting access token:', error);
        return null;
    }
}

async function refreshAccessToken() {
    console.log('Refreshing access token');
    const token = await chrome.storage.local.get('yahoo_token');
    if (!token.yahoo_token) {
        console.log('No token found, initiating authorization');
        return await authorize();
    }

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.yahoo_token.refresh_token,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const newToken = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    };

    await chrome.storage.local.set({ yahoo_token: newToken });
    return newToken.access_token;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return await authorize();
  }
}


function authorize() {
    return new Promise((resolve, reject) => {
        console.log('Initiating authorization');
        
        const authUrl = `${AUTHORIZATION_URL}?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=fspt-r`;
        console.log('Authorization URL:', authUrl);

        chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
        }, function(redirectUrl) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                const token = processRedirect(redirectUrl);
                if (token) {
                    resolve(token);
                } else {
                    reject(new Error('Failed to obtain access token'));
                }
            }
        });
    });
}

function processRedirect(redirectUrl) {
    console.log('Processing redirect:', redirectUrl);
    const url = new URL(redirectUrl);
    const hash = url.hash.substr(1);
    const params = new URLSearchParams(hash);
    
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');

    if (!accessToken) {
        console.error('No access token found in redirect');
        return null;
    }

    const token = {
        access_token: accessToken,
        expires_at: Date.now() + (parseInt(expiresIn) * 1000)
    };

    chrome.storage.local.set({ yahoo_token: token }, () => {
        console.log('Token stored');
    });

    return token;
}

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(array) {
  return btoa(String.fromCharCode.apply(null, array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function fetchLeagueData() {
    console.log('Fetching league data from Yahoo...');
    try {
      const accessToken = await getAccessToken();
      console.log('Access token obtained:', accessToken);
      if (!accessToken) {
        console.error('No access token available');
        throw new Error('No access token available');
      }
  
      // First, get the user's leagues
      const leaguesResponse = await fetchWithRetry('https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
  
      const leaguesData = await leaguesResponse.json();
      console.log('Leagues data:', JSON.stringify(leaguesData, null, 2));
  
      const league = leaguesData.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues?.[0]?.league?.[0];
      if (!league) {
        console.error('Unable to find league data in the response');
        throw new Error('League data not found');
      }
      const leagueKey = league.league_key;
      console.log('League key:', leagueKey);
  
      // Now, fetch the league data
      const response = await fetchWithRetry(`https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/teams?format=json`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
  
      const data = await response.json();
      console.log('League teams data:', JSON.stringify(data, null, 2));
      
      // Process the data
      const processedData = processYahooData(data);
      
      // Store the processed data
      await chrome.storage.local.set({ leagueData: processedData });
      console.log('League data stored:', processedData);
  
      // Notify the popup that new data is available
      chrome.runtime.sendMessage({action: 'dataUpdated'});
    } catch (error) {
      console.error('Error fetching league data:', error);
      throw error;
    }
  }

function processYahooData(data) {
    console.log('Raw Yahoo data:', JSON.stringify(data, null, 2));
    
    const teams = data.fantasy_content?.league?.[1]?.teams;
    if (!teams) {
      console.error('Unexpected data structure:', data);
      return { managers: [] };
    }
  
    const managers = Object.values(teams)
      .filter(team => typeof team === 'object' && team !== null)
      .map(team => {
        console.log('Processing team:', team);
        const teamData = team.team?.[0] || [];
        const teamMeta = team.team?.[1] || {};
        return {
          name: teamData[2]?.name || 'Unknown Team',
          faabRemaining: parseInt(teamMeta.faab_balance) || 0,
          avgBidSize: 0,  // You'll need to calculate this based on transaction history
          bidCount: 0     // You'll need to calculate this based on transaction history
        };
      });
  
    console.log('Processed managers:', managers);
    return { managers };
  }

async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}

// Fetch data immediately when the extension loads
console.log('Initiating initial data fetch');
fetchLeagueData();