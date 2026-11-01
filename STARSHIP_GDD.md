# STARSHIP

Game Design Document v0.3 --- Consolidated

Tactical starship roguelike / exploration and trading RPG Desktop
browser • Single-player • Expedition-first

Vision: Command the ship. Explore the unknown. Make your fortune.

## 1. Vision

STARSHIP combines detailed real-time-with-pause starship command with
exploration, dynamic trading and player-driven journeys through a
dangerous procedural stellar region.

The player commands a spacecraft rather than directly piloting it. At
the tactical level, crew move through rooms, systems consume reactor
power, atmosphere flows through doors, fires spread, breaches decompress
compartments, weapons damage specific systems, and enemy vessels operate
according to the same basic rules.

At the strategic level, the player navigates star systems, discovers
unexplored locations, trades between regional economies, accepts
contracts, salvages derelicts, develops faction relationships and
decides how far beyond established space to venture.

The two layers must remain interconnected: sensors support combat and
exploration; engines support evasion and travel; electronic warfare
supports combat and smuggling; engineering supports damage control and
derelict recovery; cargo capacity supports commerce but competes with
combat capability.

## 2. Design Principles

The ship is the main character. Simple controls create complex
consequences. Important information should be spatial. Pause is a
fundamental command mechanic. Recoverable failure should create stories.
Exploration should preserve uncertainty. Wealth should create choices
rather than simply bigger numbers.

Every new mechanic should preferably interact with at least two major
game layers. Mechanics that create repetitive maintenance without
meaningful decisions should be simplified or removed.

## 3. Core Gameplay Loop

Explore → Discover → Decide → Trade / Intervene → Profit / Combat /
Salvage → Upgrade Ship → Go Farther.

A typical session consists of choosing a destination, traveling,
detecting signals, deciding what to investigate, encountering ships or
stations, trading or fighting, acquiring cargo/information/salvage,
repairing and modifying the ship, and continuing toward the expedition
objective.

## 4. Game Modes

Expedition is the initial complete game: a 90--180 minute roguelike
journey through a generated stellar region with factions, markets,
missions, exploration opportunities, escalating dangers and a final
objective.

Captain Mode is a future persistent-galaxy mode supporting a
long-running ship, crew, reputation, economy and exploration history.
The architecture should permit it without making it an initial-release
requirement.

## 5. Galaxy, Systems and Navigation

The regional map shows stars, known jump routes, faction territory,
security, economic information and exploration status. Unknown systems
and routes can be discovered.

Individual systems contain planets, moons, stations, asteroid belts,
wrecks, anomalies, distress signals, hidden installations and jump
points.

Travel operates at three scales: interstellar travel between stars,
in-system travel between locations, and tactical ship-to-ship
engagements. STARSHIP deliberately avoids manual joystick-style flight
and remains a command game.

## 6. Exploration and Sensors

New systems initially contain incomplete information. Players reveal
information through passive sensors, active scans, probes, physical
investigation and purchased intelligence.

Sensors determine detection range, scan speed, signal identification,
planetary survey quality, anomaly detection, enemy detection,
hidden-cargo detection and tactical enemy information.

Unknown contacts progressively resolve from vague signatures into useful
classifications. Exploration produces survey data such as planetary
surveys, mineral surveys, route data, anomaly scans, biological
discoveries, ruins and faction intelligence. Information itself can be
sold.

## 7. Deep Space and Risk Geography

Core systems offer high security, dense markets and small margins.
Frontier regions increase danger, trading opportunities and exploration.
Deep space offers few stations, valuable discoveries and high
operational risk. Unknown regions provide extreme isolation, unique
technology and exceptional rewards.

Deep-space expeditions reward preparation: fuel capacity, efficient
engines, sensors, repair capability, cargo space, drones and
self-sufficiency.

## 8. Trading and Dynamic Economy

Stations participate in regional economies such as Agricultural,
Industrial, Mining, High-Tech, Military and Colony economies.
Production, consumption, population, technology, security and faction
state determine prices.

Markets respond dynamically to outbreaks, wars, shortages, mining booms
and other events. Visited prices are recorded with timestamps; older
intelligence becomes less reliable. Players may purchase updated market
intelligence.

Cargo capacity is finite. Cargo mass can influence fuel consumption,
engine performance, evasion and jump range, but these effects should
create decisions rather than accounting work.

## 9. Smuggling, Reputation and Missions

Jurisdictions may prohibit restricted weapons, banned AI cores, stolen
technology, biological samples or alien artifacts. Authorities can scan
ships. Players may submit, bribe, conceal cargo, spoof records, flee or
fight.

Faction reputation affects prices, docking permissions, missions,
equipment, intelligence and security response.

Mission categories include courier, freight, emergency supply,
passenger, exploration, salvage, bounty, escort, recovery, smuggling and
investigation.

## 10. Derelicts, Salvage and Prospecting

Derelict exploration reuses the core room/crew simulation. After
docking, crew physically enter the vessel, restore power, repair doors,
search compartments, recover cargo, retrieve logs, encounter survivors
or threats, manage decompression and contain fires.

Destroyed and abandoned ships can yield scrap, components, fuel, cargo,
weapons, reactor parts and intelligence. Salvage consumes time and can
attract pirates, authorities or rival salvagers.

Mining remains lightweight: sensors identify resource quality and
specialized equipment extracts materials. It should create economic
opportunities, not a repetitive extraction minigame.

## 11. Ship Model

A ship consists of hull, directional armor sections, rooms and tiles,
doors, atmosphere, systems, reactor, engines, weapons, equipment, cargo,
fuel and crew. Ships are data-driven and the simulation contains no
hard-coded assumptions about specific layouts.

Rooms track oxygen/pressure, temperature, fire, breaches, occupants,
systems and door connectivity. Doors may be open, closed, locked,
damaged or destroyed; exterior doors connect compartments to vacuum.

## 12. Atmosphere, Fire and Breaches

Atmosphere flows between connected rooms according to pressure
differences and connection rates. Breaches and open exterior doors
connect compartments to vacuum.

Low oxygen causes suffocation and suppresses fire. Fire damages crew and
systems, consumes oxygen, spreads spatially and can be extinguished
manually or by decompression.

Breaches create pressure loss and dangerous repair conditions; severity
affects decompression and repair time.

## 13. Crew

Crew are persistent individuals with name, species, health, movement
speed, skills, traits, status effects, location and orders.

Crew can move, repair, operate systems, extinguish fires, fight, heal,
board vessels, explore derelicts and perform event actions.

Initial skills include Piloting, Engines, Weapons, Shields, Repair,
Combat and Science. Traits create individual identity and may affect
both tactical and strategic play.

## 14. Reactor and Ship Systems

Reactors provide discrete power units that the player redistributes
among systems. Tactical power tradeoffs are central: for example,
temporarily removing power from oxygen to increase engine evasion
against an incoming missile.

Core systems include Reactor, Cockpit, Engines, Shields, Weapons,
Oxygen, Medbay, Sensors and Doors. Later systems may include cloaking,
drones, teleportation, electronic warfare, targeting computers, shield
modulation and auxiliary reactors.

## 15. Shields, Engines and Weapons

Shields consist of rechargeable layers. Engines provide evasion and
strategic mobility. Hit probability depends on attacker accuracy,
defender evasion, weapon properties and environmental modifiers.

Initial weapon families are Laser, Ion, Missile, Beam, Kinetic and
Experimental. Weapon definitions are data-driven and include power
requirement, charge time, projectile count, damage types, accuracy,
breach/fire chance, ion damage and ammunition cost.

Weapons normally target rooms, while specialized weapons may target
tiles, external components, ship sections or trajectories.

## 16. Directional Damage and Electronic Warfare

Ships conceptually have bow, stern, port and starboard armor sections. A
weakened side can become a tactical vulnerability without requiring
manual flight simulation.

Electronic warfare provides sensor jamming, targeting disruption, shield
interference, system hacking and drone hijacking. Strategic uses include
defeating customs scans, disguising ship identity, spoofing manifests,
intercepting communications and identifying hidden signals.

## 17. Combat and Enemy AI

Combat runs in real time with unrestricted tactical pause. The central
question is which enemy capability must be removed first, rather than
simple DPS optimization.

Enemy AI evaluates survival, offense, defense, mobility, crew safety,
cargo/objective and mission state. Enemies can target systems,
redistribute power, vent fires, repair, board, retreat and surrender.
Factions use different doctrines: pirates may disable engines to capture
cargo, while military vessels may systematically neutralize weapons.

## 18. Boarding, Damage and Capture

Boarders can attack crew, sabotage systems and capture rooms. Boarding
is risky because transported crew can become stranded.

Hits may affect hull, armor, systems, crew, atmosphere and rooms, with
secondary fire and breach probabilities. Ships normally die at zero
hull, but crew elimination, reactor catastrophe or mission-specific
states may also cause defeat.

Enemy vessels may sometimes be captured intact, offering greater salvage
at greater risk.

## 19. Stations, Shipyards and Careers

Stations provide markets, shipyards, repairs, crew, missions,
intelligence and contacts according to their size, economy, technology,
faction and location.

Shipyards modify reactor, engines, shields, weapons, sensors, cargo,
fuel, armor, EW, crew capacity and specialized modules.

There are no rigid classes. Ship configuration naturally produces
explorers, traders, bounty hunters, smugglers, salvagers and hybrid
builds.

## 20. Progression and Procedural Generation

Initial implementation uses one complete player ship; a mature game may
support roughly 6--10 distinct ship classes.

Procedural generation covers stellar regions, systems, routes,
encounters, enemy configurations, markets, stores, contracts, rewards
and some crew. Generation uses authored templates and constraints:
designed situations assembled procedurally.

Difficulty should increase decision pressure through smarter enemies,
resource scarcity, market volatility, repair costs and exploration
danger rather than simply inflating enemy health.

Meta progression primarily unlocks knowledge and options rather than
permanent raw statistical power.

## 21. Deterministic Simulation and Saving

Simulation uses a seeded random number generator. Identical initial
state, commands and seed should produce identical outcomes, enabling
debugging, testing, replays, balance simulation and reproducible bug
reports.

Simulation runs on a fixed timestep, initially targeting 20 simulation
ticks per second, while rendering runs independently at 60+ FPS.

Save state includes random seed, galaxy/system state, location, ship and
crew state, cargo, markets, missions, reputation, resources, event flags
and simulation state. Saving during combat should be possible.

## 22. Technical Architecture

Recommended stack: TypeScript simulation core and game rules;
data-driven content; PixiJS/WebGL for game rendering; React only for the
surrounding application shell and appropriate menus/settings.

The simulation has no dependency on PixiJS or React. Commands enter the
simulation, state changes occur deterministically, game events are
emitted, and renderer/audio respond to those events.

Content should live outside simulation logic in data directories for
ships, weapons, crew, systems, events, encounters, stars, economies,
commodities, factions and missions.

## 23. Art and Audio Direction

Visual direction: high-resolution retro tactical science fiction.
Painted/pixel-influenced ships, readable room geometry, dark space
environments, restrained UI palette, bright combat effects, clear crew
sprites and strong system iconography. Gameplay readability takes
precedence over realism.

Audio communicates system state through shield/hull impacts,
weapon-ready cues, incoming missiles, fire, breaches, low oxygen,
injury, system failure, jump readiness, signal detection, scans,
docking, discoveries and anomalies.

## 24. Combat MVP

The first playable milestone is one excellent battle: one player ship,
three crew, one enemy, cockpit, engines, shields, weapons, oxygen and
medbay, plus laser and ion weapons.

It must support pause, crew movement, reactor allocation, system power,
weapon charging, targeting, projectiles, shields, evasion, hull/system
damage, repairs, oxygen, fire, breaches, crew death, victory and defeat.

The first prototype succeeds when the player must simultaneously manage
crew, systems, power, weapons and emergencies.

## 25. Star System Sandbox

After combat is proven, build one star-system sandbox containing one
star, three planets, one asteroid belt, two stations, three unknown
signals, one derelict, one pirate encounter, one trade route,
approximately ten commodities, one exploration contract and one freight
contract.

Target 20--30 minutes of meaningful play within this single system
before scaling outward.

## 26. Development Phases

1.  Simulation foundation: deterministic clock, entity IDs, RNG,
    commands, events, ship state and room graph.
2.  Ship prototype: room rendering, doors, crew, pathfinding and
    selection.
3.  Combat: reactor, systems, weapons, projectiles, targeting, shields
    and damage.
4.  Emergencies: repair, atmosphere, breaches, fire, crew health and
    medbay.
5.  Enemy intelligence: targeting, power management, repair priorities,
    crew AI, retreat and surrender.
6.  Single-system exploration: system map, travel, sensors, signals,
    scanning and derelicts.
7.  Economy: stations, commodities, cargo, markets, dynamic prices and
    contracts.
8.  Stellar region: multiple systems, routes, factions, reputation and
    regional generation.
9.  Advanced systems: EW, directional damage, advanced traits, boarding,
    capture and deep-space expeditions.
10. Content expansion: ships, weapons, enemies, factions, commodities,
    events, missions and discoveries.

## 27. Non-Goals

Initial development deliberately excludes multiplayer/MMO functionality,
manual 3D flight, planetary surface gameplay, walking around stations,
realistic orbital mechanics, hundreds of commodities, thousands of star
systems, cloud accounts, a mod editor, procedural ship layouts and
elaborate visual effects.

## 28. Design Risk and Integration Rule

The main risk is excessive cognitive load. Every mechanic must create an
interesting command decision rather than repetitive maintenance.

New mechanics should preferably connect at least two layers. Sensors
connect combat and exploration. Engines connect combat and travel. EW
connects combat, intelligence and smuggling. Engineering connects damage
control and derelict exploration. Cargo connects trading, ship
configuration and piracy risk. Reputation connects commerce, missions
and security.

## 29. Distinguishing Systems

STARSHIP's identity comes from detailed internal ship simulation,
dynamic atmosphere, derelict exploration, directional damage, electronic
warfare, characterized crew, systemic enemy vessels, meaningful
exploration, dynamic economy and freedom of profession.

## 30. Definition of Fun

Combat should create emergent chains of consequences: a missile disables
weapons; the room catches fire; the gunner evacuates; oxygen is vented;
power moves to engines; an engineer repairs the system; the laser comes
back online and disables the enemy's engines.

Exploration should create opportunity-cost stories: a valuable signal
pulls the player away from a trade route; a derelict yields rare
technology but causes delay and damage.

Trading should make danger meaningful: cargo creates financial exposure,
so route choice, escape, defense and combat decisions suddenly matter.

The systems are successful when these stories emerge naturally rather
than being scripted.

## 31. Product Identity

STARSHIP is a tactical starship command roguelike combining detailed
internal ship simulation with exploration, dynamic trading and
player-driven journeys through a dangerous procedural galaxy.

The fundamental unit of the game remains the ship.

The galaxy gives the player somewhere meaningful to take it.

## 32. Next Engineering Artifact

The next artifact should be STARSHIP Technical Design Document v0.1,
specifying repository structure, simulation state, TypeScript
interfaces, entity boundaries, commands/events, deterministic RNG, fixed
game loop, room graphs, crew pathfinding, atmosphere/fire algorithms,
damage resolution, weapon state machines, AI, galaxy generation, market
simulation, save schema, content schemas, rendering synchronization and
testing strategy.
