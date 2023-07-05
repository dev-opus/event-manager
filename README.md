# Event Manager ICP Canister Smart Contract
This is a Proof of Concept (PoC) **ICP** Canister Smart-Contract built using TypeScript and Node.js on top of the Azle framework that
also doubles as my submission to the [Internet Computer TypeScript Smart Contract 101](https://dacade.org/communities/icp/courses/typescript-smart-contract-101)
course.

This smart contract allows users (**organizer**s) to create events and other users (**attendee**s) to 
purchase tickets for the events.

Functions available for interacting with the smart contract include:

- **createUser** -- userId and password protected
- **topUpUserBalance** -- userId and password protected
- **createEvent** -- userId and password protected
- **deleteEvent** -- userId and password protected
- **getEvents**
- **getEvent** -- userId and password protected
- **topUpEventTickets** -- userId and password protected
- **purchaseTicket** -- userId and password protected
- **getTicketsAttendee** -- userId and password protected
- **getTicketsOrganizer** -- userId and password protected

## Interacting with the Canister
Please refer to this [section](https://dacade.org/communities/icp/courses/typescript-smart-contract-101/learning-modules/b14741ea-ee33-43a4-a742-9cdc0a6f0d1c#3-deploying-and-interacting-with-our-canister)
for more details on how to deploy and interact with the canister.

## Contributing
Found a bug or thought of a neat feature to add? Please fork the repo and open a pull request!
  
